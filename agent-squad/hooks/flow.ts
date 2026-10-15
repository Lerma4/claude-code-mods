import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { FileStat, Flow, FlowAgent, FlowEvent, FlowKind, FlowSummary, FlowTouch } from '../types'

// The flow view: every tool call, spawn and prompt, dumped to data.js beside a static page
// (viewer/index.html) that re-reads it every second in the browser.

const MAIN = 'main'
const MAX_EVENTS = 3000
// File touches are small and kept apart, so the file list outlives the oldest calls.
const MAX_TOUCHES = 20000
const CLIP = 1500
// The history lives in $.store (4 MiB in all): a few KB per session.
const HISTORY = 'storico'
const MAX_HISTORY = 1500
const MAX_HISTORY_FILES = 50
const HISTORY_EVERY_MS = 30_000
const flow = atom({ plugin: 'agent-squad', key: 'flow' } as const, { agents: [], events: [], prompts: [], touches: [] } as Flow)

const VERIFY = /\b(test|tests|pytest|vitest|jest|tsc|lint|eslint|build|mvn|gradle|cargo|go test|dotnet|npm run|pnpm|yarn|make)\b/i
const SEARCH = new Set(['Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'LSP'])

export const kindOf = (tool: string, command = ''): FlowKind => {
  if (tool === 'Read' || tool === 'NotebookRead') return 'read'
  if (SEARCH.has(tool)) return 'search'
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'Write') return 'write'
  if (tool === 'Bash' || tool === 'PowerShell') return VERIFY.test(command) ? 'verify' : 'shell'
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  return 'other'
}

// Same file, same key: forward slashes, relative to the session directory when under it.
export const relPath = (path: string, cwd: string): string => {
  const p = path.replace(/\\/g, '/')
  const c = cwd.replace(/\\/g, '/').replace(/\/$/, '')
  return p.toLowerCase().startsWith(c.toLowerCase() + '/') ? p.slice(c.length + 1) : p
}

const HINTS = ['description', 'command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'path', 'prompt']
const clip = (s: unknown, n = CLIP) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : undefined)

export const toEvent = (e: Record<string, unknown>, cwd: string, n: number, t: number): FlowEvent => {
  const tool = String(e.tool)
  const kind = kindOf(tool, typeof e.command === 'string' ? e.command : '')
  const hint = HINTS.map(k => e[k]).find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? ''
  const raw = (e.file_path ?? e.notebook_path) as string | undefined
  const file = raw && ['read', 'edit', 'write'].includes(kind) ? relPath(raw, cwd) : undefined
  const ev: FlowEvent = { n, t, agent: (e.agentId as string) ?? MAIN, tool, kind, hint: clip(hint.replace(/\s+/g, ' ').trim(), 200)!, file }
  if (kind === 'agent') ev.call = e.tool_use_id as string
  if (tool === 'Edit') Object.assign(ev, { old: clip(e.old_string), new: clip(e.new_string) })
  if (tool === 'Write') ev.new = clip(e.content)
  if (kind === 'verify' || kind === 'shell') ev.old = clip(e.command)
  return ev
}

// Attention per file and why it matters. ponytail: heuristic weights, tune them by eye.
export const fileStats = (events: readonly FlowTouch[]): FileStat[] => {
  const by = new Map<string, FileStat>()
  const get = (path: string) => by.get(path) ?? by.set(path, { path, reads: 0, edits: 0, writes: 0, agents: [], score: 0, why: [] }).get(path)!
  const lastFail = new Map<string, number>()
  const recentReads = new Map<string, string[]>()
  for (const ev of events) {
    if (ev.kind === 'verify') {
      if (ev.ok === false) lastFail.set(ev.agent, ev.n)
      else lastFail.delete(ev.agent)
    }
    if (!ev.file) continue
    const f = get(ev.file)
    if (!f.agents.includes(ev.agent)) f.agents.push(ev.agent)
    if (ev.kind === 'read') {
      f.reads++
      const r = (recentReads.get(ev.agent) ?? []).filter(p => p !== ev.file).slice(-4)
      recentReads.set(ev.agent, [...r, ev.file])
      continue
    }
    if (ev.kind === 'edit') f.edits++
    else f.writes++
    // The files read just before a change are the context the change came from.
    for (const p of recentReads.get(ev.agent) ?? []) {
      if (p === ev.file) continue
      const ctx = get(p)
      ctx.score += 2
      if (!ctx.why.includes('contesto di una modifica')) ctx.why.push('contesto di una modifica')
    }
    recentReads.set(ev.agent, [])
    if (lastFail.has(ev.agent)) {
      f.score += 3
      if (!f.why.includes('corretto dopo un test fallito')) f.why.push('corretto dopo un test fallito')
    }
  }
  for (const f of by.values()) {
    f.score += 5 * (f.edits + f.writes) + f.reads + 2 * (f.agents.length - 1)
    if (f.writes && !f.edits) f.why.unshift('creato')
    else if (f.edits) f.why.unshift(`modificato ${f.edits}×`)
    if (f.reads > 2) f.why.push(`riletto ${f.reads}×`)
    if (f.agents.length > 1) f.why.push(`${f.agents.length} agenti`)
  }
  return [...by.values()].sort((a, b) => b.score - a.score)
}

// Pure: the history row of one session, modified files only, the most crucial first.
export const summarize = (id: string, project: string, f: Flow, updated: number): FlowSummary => ({
  id,
  project,
  start: f.agents.find(a => a.id === MAIN)?.start ?? updated,
  updated,
  agents: f.agents.filter(a => a.id !== MAIN).length,
  calls: f.events.at(-1)?.n ?? 0,
  prompt: f.prompts[0]?.text.slice(0, 120),
  files: fileStats(f.touches)
    .filter(s => s.edits + s.writes > 0)
    .slice(0, MAX_HISTORY_FILES)
    .map(s => ({ path: s.path, edits: s.edits, writes: s.writes, score: s.score })),
})

// Pure: the session folders to delete, all but the `keep` most recent (the current one always kept).
export const toPrune = (dirs: readonly string[], history: readonly FlowSummary[], current: string, keep: number): string[] => {
  const when = new Map(history.map(h => [h.id, h.updated]))
  return dirs
    .filter(d => d !== current)
    .sort((a, b) => (when.get(b) ?? 0) - (when.get(a) ?? 0))
    .slice(Math.max(0, keep - 1))
}

// Module state: a reload starts these over, the flow itself lives in $.state.
let root = ''
let out = ''
let sessionId = ''
let dirty = true
let seq = 0
let savedAt = 0

function patch($: EngineInterface, id: string, p: (a: FlowAgent) => Partial<FlowAgent>) {
  return update($, flow, f => ({ ...f, agents: f.agents.map(a => (a.id === id ? { ...a, ...p(a) } : a)) }))
}

async function history($: EngineInterface): Promise<FlowSummary[]> {
  return ((await $.store.get(HISTORY)) as FlowSummary[] | undefined) ?? []
}

// Folders under sessioni/ that still hold a full flow.
async function detailed($: EngineInterface): Promise<string[]> {
  if (!(await $.fs.exists(`${root}/sessioni`))) return []
  return (await $.fs.list(`${root}/sessioni`)).filter(e => e.kind === 'dir' && /^[\w-]+$/.test(e.name)).map(e => e.name)
}

// Writes this session's row into the history and the history page's data.
async function saveHistory($: EngineInterface, f: Flow, now: number) {
  savedAt = now
  const row = summarize(sessionId, await $.session.root(), f, now)
  const rows = [row, ...(await history($)).filter(h => h.id !== sessionId)].slice(0, MAX_HISTORY)
  await $.store.set(HISTORY, rows)
  const detail = await detailed($)
  await $.fs.write(`${root}/storico.js`, `window.__STORICO(${JSON.stringify(rows.map(r => ({ ...r, detail: detail.includes(r.id) })))})`)
}

// Rewrites data.js when something changed, and the history row at most every 30 s.
async function dump($: EngineInterface, force = false) {
  if (!out || (!dirty && !force)) return
  dirty = false
  const f = await read($, flow)
  const now = await $.clock.now()
  const data = { ...f, touches: undefined, files: fileStats(f.touches), cwd: await $.session.cwd(), updated: now }
  await $.fs.write(`${out}/data.js`, `window.__FLOW(${JSON.stringify(data)})`)
  if (force || now - savedAt > HISTORY_EVERY_MS) await saveHistory($, f, now)
}

async function launch($: EngineInterface, page: string): Promise<string> {
  const path = page.replace(/\//g, '\\')
  const ran = await $.process.run(['cmd', '/c', 'start', '', path])
  return ran.exitCode === 0 ? '' : path
}

// Opens the page in the default browser, on the whole session or on one agent and its subagents.
export async function openFlow($: EngineInterface, agentId?: string): Promise<string> {
  dirty = true
  await dump($, true)
  // `start` drops a #fragment on a file path, so a one-line page carries it instead.
  if (!agentId) return launch($, `${out}/index.html`)
  await $.fs.write(`${out}/agente.html`, `<script>location.replace('index.html#agent=' + ${JSON.stringify(encodeURIComponent(agentId))})</script>`)
  return launch($, `${out}/agente.html`)
}

// Opens the list of past sessions.
export async function openHistory($: EngineInterface): Promise<string> {
  await dump($, true)
  return launch($, `${root}/index.html`)
}

// Called from the squad's own hooks: the engine takes one unfiltered hook per event per plugin.

export async function flowStart($: EngineInterface, keep: number) {
  // ponytail: Windows only (%USERPROFILE%, `start`); add open/xdg-open when someone runs it elsewhere.
  const home = (await $.process.run(['cmd', '/c', 'echo %USERPROFILE%'])).stdout.trim().replace(/\\/g, '/')
  root = `${home}/.claude/agent-flow`
  sessionId = await $.session.id()
  out = `${root}/sessioni/${sessionId}`
  await $.fs.write(`${out}/index.html`, await $.fs.read(`${$.plugin.root}/viewer/index.html`))
  await $.fs.write(`${root}/index.html`, await $.fs.read(`${$.plugin.root}/viewer/storico.html`))
  for (const old of toPrune(await detailed($), await history($), sessionId, keep)) {
    await $.process.run(['cmd', '/c', 'rmdir', '/s', '/q', `${root}/sessioni/${old}`.replace(/\//g, '\\')])
  }
  // A flow kept from 0.5.0, before touches existed.
  if (!(await read($, flow)).touches) {
    await update($, flow, x => ({ ...x, touches: x.events.filter(e => e.file || e.kind === 'verify').map(e => ({ n: e.n, agent: e.agent, kind: e.kind, file: e.file, ok: e.ok })) }))
  }
  const f = await read($, flow)
  seq = f.events.at(-1)?.n ?? 0
  if (!f.agents.some(a => a.id === MAIN)) {
    const t = await $.clock.now()
    await update($, flow, x => ({ ...x, agents: [{ id: MAIN, type: 'main', description: 'Sessione principale', start: t, status: 'idle' as const }, ...x.agents] }))
  }
  $.clock.every(1000, () => dump($))
}

export async function flowPrompt($: EngineInterface, text: string) {
  const t = await $.clock.now()
  await update($, flow, f => ({ ...f, prompts: [...f.prompts, { t, text: text.slice(0, 300) }] }))
  dirty = true
}

export async function flowAgent($: EngineInterface, a: Omit<FlowAgent, 'start' | 'status'>) {
  const t = await $.clock.now()
  await update($, flow, f => ({ ...f, agents: [...f.agents.filter(x => x.id !== a.id), { ...a, start: t, status: 'running' as const }] }))
  dirty = true
}

export async function flowStatus($: EngineInterface, id: string, status: FlowAgent['status'], isEnd: boolean) {
  const t = await $.clock.now()
  await patch($, id, () => (isEnd ? { status, end: t } : { status }))
  dirty = true
}

// Records the call before it runs; the returned function records how it ended.
export async function flowCall($: EngineInterface, e: Record<string, unknown>) {
  const t = await $.clock.now()
  const ev = toEvent(e, await $.session.cwd(), ++seq, t)
  const touch: FlowTouch | undefined = ev.file || ev.kind === 'verify' ? { n: ev.n, agent: ev.agent, kind: ev.kind, file: ev.file } : undefined
  await update($, flow, f => ({
    ...f,
    events: [...f.events, ev].slice(-MAX_EVENTS),
    touches: touch ? [...f.touches, touch].slice(-MAX_TOUCHES) : f.touches,
  }))
  dirty = true
  return async (ran: { deny?: string; isError?: boolean; text?: string }) => {
    const done = { ms: (await $.clock.now()) - t, ok: ran.deny === undefined && !ran.isError, out: clip(ran.deny ?? ran.text, 800) }
    await update($, flow, f => ({
      ...f,
      events: f.events.map(x => (x.n === ev.n ? { ...x, ...done } : x)),
      touches: touch ? f.touches.map(x => (x.n === ev.n ? { ...x, ok: done.ok } : x)) : f.touches,
    }))
    dirty = true
  }
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SquadAgent, SquadStatus } from '../types'

const PANE = 'agent-squad'
const TITLE = 'La Squadra'
const MAX = 20
const MAIN = 'main'
const agents = atom({ plugin: 'agent-squad', key: 'agents' } as const, [])
// Ticks once a second while someone is at work, so the running clocks redraw.
const now = atom({ plugin: 'agent-squad', key: 'now' } as const, 0)

const NAMES = [
  'Gigi Grep', 'Rita Regex', 'Beppe Bash', 'Tina Token', 'Nando Null',
  'Pina Pipeline', 'Ugo Undefined', 'Franca Fork', 'Mimmo Merge', 'Lella Lambda',
  'Tonino Timeout', 'Carla Cache', 'Sandro Stacktrace', 'Wanda Wildcard',
  'Peppino Ping', 'Ornella Overflow', 'Dario Deploy', 'Silvia Socket',
  'Rocco Rollback', 'Gina Git',
]

// A random name not already on screen; repeats only when every name is taken.
export const pickName = (taken: string[], rand = Math.random): string => {
  const free = NAMES.filter(n => !taken.includes(n))
  const pool = free.length ? free : NAMES
  return pool[Math.floor(rand() * pool.length)]
}

const ROLES: Record<string, { logo: string; title: string; role: string }> = {
  main: { logo: '👑', title: 'Coordinatore', role: 'Parla con te e smista il lavoro' },
  Explore: { logo: '🔍', title: 'Segugio', role: 'Fruga nel codice e trova file e simboli' },
  Plan: { logo: '🧭', title: 'Architetto', role: "Disegna il piano d'attacco" },
  'general-purpose': { logo: '🔧', title: 'Tuttofare', role: 'Ricerche e lavori in più passi' },
  'claude-code-guide': { logo: '📖', title: 'Bibliotecario', role: 'Conosce a memoria la documentazione' },
  fork: { logo: '🧬', title: 'Clone', role: 'Una copia del capo con lo stesso contesto' },
  'statusline-setup': { logo: '🎨', title: 'Decoratore', role: 'Sistema la status line' },
  teammate: { logo: '🤝', title: 'Compagno di squadra', role: 'Lavora in parallelo nel team' },
  claude: { logo: '🧠', title: 'Jolly', role: 'Agente generico, fa un po\' di tutto' },
}

// Generic agents: the job, not the type, says what they do.
const GENERIC = new Set(['general-purpose', 'claude', 'fork'])

// Role guessed from keywords in a custom agent's name or in the task description (English or Italian).
// First match wins, so the more specific roles come first.
const KINDS: [RegExp, { logo: string; title: string; role: string }][] = [
  [/secur|sicurezz|\bauth|login|permess|pentest|vuln/, { logo: '🛡️', title: 'Guardiano', role: 'Permessi, login e vulnerabilità' }],
  [/debug|\bbug|diagnos|\bfix|corregg|errore/, { logo: '🐛', title: 'Acchiappabug', role: 'Riproduce e risolve i bug' }],
  [/review|revision|rivedi|audit|critic/, { logo: '🧐', title: 'Revisore', role: 'Rilegge il codice e scova i difetti' }],
  [/\btest(s|ing)?\b|collaud|\bqa\b|tdd|e2e|regression/, { logo: '🧪', title: 'Collaudatore', role: 'Scrive test e caccia regressioni' }],
  [/\b(db|sql)\b|database|schema|migra|prisma|tabell|query/, { logo: '🗄️', title: 'Archivista', role: 'Tabelle, query e migrazioni' }],
  [/devops|deploy|docker|k8s|kube|\bci\b|infra|release|rilasc|pipeline/, { logo: '🚀', title: 'Sistemista', role: 'Build, deploy e infrastruttura' }],
  [/perf|prestazion|optimi|ottimizz|velocizz|cache/, { logo: '⚡', title: 'Ottimizzatore', role: 'Rende tutto più veloce' }],
  [/integra|webhook|\bsync|connector/, { logo: '🔌', title: 'Integratore', role: 'Collega sistemi esterni e API di terzi' }],
  [/\bdat[ai]\b|analy|anali|report|etl|export|import|estrazion/, { logo: '📊', title: 'Analista', role: 'Dati, report ed export' }],
  [/asset|image|immagin|icon/, { logo: '🖼️', title: 'Grafico', role: 'Prepara immagini e asset' }],
  [/design|\bux\b|style|stile|theme|\btema|grafic/, { logo: '💅', title: 'Designer', role: 'Cura UX e aspetto grafico' }],
  [/front|\bui\b|react|angular|\bvue|svelte|css|component|interfacc|schermat|pagin|maschera|\bform\b/, { logo: '🖥️', title: 'Frontendista', role: 'Schermate, form e componenti' }],
  [/\bback|\bapi\b|server|service|servizi|endpoint/, { logo: '⚙️', title: 'Backendista', role: 'API e logica di business' }],
  [/i18n|transl|tradu|locali/, { logo: '🌍', title: 'Traduttore', role: 'Testi e traduzioni' }],
  [/\bdoc|writer|readme|changelog/, { logo: '📝', title: 'Scrivano', role: 'Documentazione e README' }],
  [/refactor|rifattor|simplif|semplific|clean|pulizi/, { logo: '🧹', title: 'Spazzino', role: 'Refactoring e pulizia' }],
  [/architect|architett|\bplan|\bpiano/, { logo: '🧭', title: 'Architetto', role: "Disegna il piano d'attacco" }],
  [/explor|esplor|search|research|find|\bcerca|\btrova/, { logo: '🔍', title: 'Segugio', role: 'Fruga nel codice e trova file e simboli' }],
]

const pretty = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const guess = (text: string) => KINDS.find(([re]) => re.test(text.toLowerCase()))?.[1]

export const roleOf = (type: string, description = '') => {
  if (ROLES[type] && !GENERIC.has(type)) return ROLES[type]
  // Plugin agents are named 'plugin:agent'; the plugin name only says where it came from.
  const [plugin, agent] = type.includes(':') ? type.split(/:(.*)/) : ['', type]
  const kind = (!GENERIC.has(type) && guess(agent)) || guess(description)
  if (kind) return kind
  if (ROLES[type]) return ROLES[type]
  return plugin
    ? { logo: '🧩', title: pretty(agent), role: `Dal plugin ${plugin}` }
    : { logo: '🤖', title: 'Agente', role: type }
}

const STATUS: Record<SquadStatus, { icon: string; label: string; color: string }> = {
  running: { icon: '●', label: 'al lavoro', color: 'claude' },
  idle: { icon: '○', label: 'in attesa', color: 'subtle' },
  completed: { icon: '✔', label: 'finito', color: 'success' },
  failed: { icon: '✖', label: 'errore', color: 'error' },
  killed: { icon: '■', label: 'fermato', color: 'inactive' },
}

// The tool argument that best says what a call is doing, first match wins.
const HINTS = ['description', 'command', 'file_path', 'pattern', 'url', 'query', 'path', 'prompt']

export const describe = (e: { tool: string }): string => {
  const args = e as unknown as Record<string, unknown>
  const hint = HINTS.map(k => args[k]).find((v): v is string => typeof v === 'string' && v.trim() !== '')
  return hint ? `${e.tool}: ${hint.replace(/\s+/g, ' ').trim()}` : e.tool
}

// 'claude-haiku-4-5-20251001' -> 'haiku 4.5'; an alias ('haiku') stays as it is.
export const shortModel = (model: string): string =>
  model
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-(\d+)$/, ' $1')

// 42_000 -> '42s', 125_000 -> '2m 05s', 3_720_000 -> '1h 02m'.
export const elapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`
  return `${Math.floor(s / 3600)}h ${pad(Math.floor(s / 60) % 60)}m`
}

// Starts the clock of a row that was not already running.
const start = async ($: EngineInterface, id: string, patch: Partial<SquadAgent>) => {
  const t = await $.clock.now()
  await touch($, id, a => ({ ...patch, status: 'running', since: a.status === 'running' && a.since ? a.since : t }))
}

const fresh = (id: string, list: SquadAgent[]): SquadAgent =>
  id === MAIN
    ? { id, name: 'Il Capo', type: 'main', description: '', status: 'idle', activity: '' }
    : {
        id,
        name: pickName(list.map(a => a.name)),
        type: 'agent',
        description: '',
        status: 'running',
        activity: '',
      }

// Patch the row with this id, adding it first when it is new; trims the oldest finished rows.
const touch = ($: EngineInterface, id: string, patch: (a: SquadAgent) => Partial<SquadAgent>) =>
  update($, agents, list => {
    const known = list.some(a => a.id === id)
    const all = known ? list : [...list, fresh(id, list)]
    const out = all.map(a => (a.id === id ? { ...a, ...patch(a) } : a))
    while (out.length > MAX) {
      const old = out.findIndex(a => a.id !== MAIN && a.status !== 'running')
      if (old < 0) break
      out.splice(old, 1)
    }
    return out
  })

const ended = (a: SquadAgent, reason: string): Partial<SquadAgent> => {
  if (a.id === MAIN || a.type === 'teammate') return { status: 'idle', activity: 'Aspetta istruzioni' }
  if (reason === 'answer') return { status: 'completed', activity: 'Missione compiuta' }
  if (reason === 'aborted') return { status: 'killed', activity: 'Interrotto' }
  return { status: 'failed', activity: 'Qualcosa è andato storto' }
}

// New random names for every agent but the boss, or only for the one called `who`.
export const reroll = (list: SquadAgent[], who = '', rand = Math.random): SquadAgent[] => {
  const out = list.map(a => ({ ...a }))
  for (const a of out) {
    if (a.id !== MAIN && (!who || a.name.toLowerCase() === who.toLowerCase())) a.name = pickName(out.map(b => b.name), rand)
  }
  return out
}

const order = (a: SquadAgent) => (a.id === MAIN ? 0 : a.status === 'running' ? 1 : a.status === 'idle' ? 2 : 3)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'squadra', description: 'Mostra il pannello con gli agenti al lavoro', argumentHint: '[pulisci | tombola [nome]]' })
    void $.ui.open({ id: PANE, title: TITLE, columns: 46 })
    $.clock.every(1000, async () => {
      if ((await read($, agents)).some(a => a.status === 'running')) {
        const t = await $.clock.now()
        await update($, now, () => t)
      }
    })
    return next(e)
  })

  on('command.run', { command: 'squadra' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    if (sub === 'tombola') {
      const who = rest.join(' ')
      const target = (await read($, agents)).find(a => a.id !== MAIN && a.name.toLowerCase() === who.toLowerCase())
      if (who && !target) return { text: `Nessun agente si chiama ${who} (il capo non partecipa alla tombola).` }
      const out = await update($, agents, l => reroll(l, who))
      if (!target) return { text: 'Tombola! Nuovi nomi estratti per tutta la squadra, capo escluso.' }
      return { text: `Ambo! ${target.name} ora si chiama ${out.find(a => a.id === target.id)?.name}.` }
    }
    if (sub === 'pulisci') {
      await update($, agents, list => list.filter(a => a.id === MAIN || a.status === 'running'))
      return { text: 'Squadra ripulita: restano solo gli agenti al lavoro.' }
    }
    await $.ui.open({ id: PANE, title: TITLE, columns: 46 })
    return { text: 'Pannello della squadra aperto.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) {
      await start($, started.agentId, {
        type: e.subagentType,
        description: e.description,
        model: started.model,
        activity: 'Si scalda i muscoli…',
      })
    }
    return started
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const list = await read($, agents)
    if (id !== MAIN && !list.some(a => a.id === id)) {
      // Not spawned while we watched (a reload, a teammate): adopt it only if the engine lists it.
      const info = (await $.agent.list()).find(a => a.id === id)
      if (!info) return next(e)
      await touch($, id, () => ({ type: info.type, description: info.description }))
    }
    await start($, id, { activity: describe(e) })
    return next(e)
  })

  // Every model request names the model it goes to: the live truth for the main loop and each subagent.
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId ?? MAIN
    const row = (await read($, agents)).find(a => a.id === id)
    const effort = e.effort === undefined ? undefined : String(e.effort)
    if ((row || id === MAIN) && (row?.model !== e.model || row?.effort !== effort)) {
      await touch($, id, () => ({ model: e.model, effort }))
    }
    return yield* next(e)
  })

  on('turn.start', async ($, e, next) => {
    await start($, MAIN, { activity: 'Ci sta pensando…' })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const list = await read($, agents)
    if (id === MAIN || list.some(a => a.id === id)) {
      const t = await $.clock.now()
      await touch($, id, a => ({ ...ended(a, e.reason), since: undefined, lastMs: e.durationMs || (a.since ? t - a.since : a.lastMs) }))
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = [...(await read($, agents))].sort((a, b) => order(a) - order(b))
    const busy = list.filter(a => a.status === 'running').length
    await read($, now) // subscribes the pane to the ticks
    const t = await $.clock.now()
    // Running: how long so far. Otherwise: how long the last task took.
    const timer = (a: SquadAgent) =>
      a.status === 'running' ? (a.since ? ` · ${elapsed(t - a.since)}` : '') : a.lastMs !== undefined ? ` · ${elapsed(a.lastMs)}` : ''

    return (
      <Box flexDirection="column">
        <Text bold color="claude">⚡ La Squadra</Text>
        <Text dimColor wrap="wrap">{busy} al lavoro · {list.length - busy} a riposo</Text>
        {list.length === 0 && <Text dimColor>Nessun agente in campo.</Text>}
        {list.map(a => {
          const r = roleOf(a.type, a.description)
          const s = STATUS[a.status]
          return (
            <Box flexDirection="column" marginTop={1}>
              {/* Wraps instead of truncating: in a narrow pane the status drops below the name. */}
              <Box flexWrap="wrap" justifyContent="space-between" columnGap={1}>
                <Box flexWrap="wrap" flexShrink={1}>
                  <Text bold wrap="wrap">{r.logo} {a.name}</Text>
                  {a.model && <Text color="suggestion" wrap="wrap"> · {shortModel(a.model)}</Text>}
                  {a.effort && <Text color="warning" wrap="wrap"> · {a.effort}</Text>}
                </Box>
                <Text color={s.color} wrap="wrap">{s.icon} {s.label}{timer(a)}</Text>
              </Box>
              <Text dimColor italic wrap="wrap">{r.title} · {a.description || r.role}</Text>
              <Text color={a.status === 'running' ? 'text' : 'subtle'} wrap="wrap">↳ {a.activity || '—'}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}

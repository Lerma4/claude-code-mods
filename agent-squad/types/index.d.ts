export type SquadStatus = 'running' | 'idle' | 'completed' | 'failed' | 'killed'

export type SquadAgent = {
  id: string
  name: string
  type: string
  description: string
  status: SquadStatus
  activity: string
  model?: string
  effort?: string
  // When the current task started (ms since epoch), set while running.
  since?: number
  // How long the last finished task took, in ms.
  lastMs?: number
}

export type FlowKind = 'read' | 'search' | 'edit' | 'write' | 'verify' | 'shell' | 'agent' | 'other'

// One tool call as the flow view shows it.
export type FlowEvent = {
  n: number
  t: number
  ms?: number
  agent: string
  tool: string
  kind: FlowKind
  hint: string
  file?: string
  ok?: boolean
  // tool_use_id of an Agent call: links it to the subagent it spawned.
  call?: string
  old?: string
  new?: string
  out?: string
}

export type FlowAgent = {
  id: string
  parent?: string
  call?: string
  type: string
  description: string
  model?: string
  start: number
  end?: number
  status: SquadStatus
}

export type FlowPrompt = { t: number; text: string }

// What file scores need from a call, kept longer than the calls themselves.
export type FlowTouch = Pick<FlowEvent, 'n' | 'agent' | 'kind' | 'file' | 'ok'>

export type Flow = { agents: FlowAgent[]; events: FlowEvent[]; prompts: FlowPrompt[]; touches: FlowTouch[] }

// One past session in the history: small on purpose, it is kept for good.
export type FlowSummary = {
  id: string
  project: string
  start: number
  updated: number
  agents: number
  calls: number
  prompt?: string
  files: { path: string; edits: number; writes: number; score: number }[]
}

export type FileStat = {
  path: string
  reads: number
  edits: number
  writes: number
  agents: string[]
  score: number
  why: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'agent-squad': { agents: SquadAgent[]; now: number; flow: Flow }
  }
}

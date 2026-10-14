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

declare module 'claude-code' {
  interface PluginState {
    'agent-squad': { agents: SquadAgent[]; now: number }
  }
}

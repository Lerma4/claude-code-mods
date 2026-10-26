export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  limits: Limit[]
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  usd?: number
  model?: string
  effort?: string | number
  refreshExpiresAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    'token-bar': { snap: Snapshot | null }
  }
}

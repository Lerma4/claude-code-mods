import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Snapshot } from '../types'

const snap = atom({ plugin: 'token-bar', key: 'snap' } as const, null)

const LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7gg', spend_limit: 'spesa' }
const WIDTH = 14

// verde < 60, giallo < 85, rosso oltre
const tone = (p: number) => (p >= 85 ? '#f7768e' : p >= 60 ? '#e0af68' : '#9ece6a')

const bar = (p: number) => {
  const n = Math.round((Math.min(100, Math.max(0, p)) / 100) * WIDTH)
  return { on: '█'.repeat(n), off: '░'.repeat(WIDTH - n) }
}

const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`)

const until = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const m = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d > 0 ? `${d}g ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

const toSnap = (u: {
  rateLimits: Snapshot['limits']
  context: { percent?: number; tokens?: number; window: number }
  cost?: { usd: number }
}): Snapshot => ({
  limits: u.rateLimits,
  contextPercent: u.context.percent,
  contextTokens: u.context.tokens,
  contextWindow: u.context.window,
  usd: u.cost?.usd,
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const u = await $.session.usage()
    await update($, snap, () => toSnap(u))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, snap, () => toSnap(e))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)

    if (e.props.hasSurvey || s === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    const meters = s.limits.map(l => {
      const b = bar(l.percentUsed)
      const c = tone(l.percentUsed)
      const reset = until(l.resetsAt, now)

      return (
        <Box key={l.kind} gap={1}>
          <Text bold>{LABEL[l.kind] ?? l.kind}</Text>
          <Text color={c}>{b.on}</Text>
          <Text dimColor>{b.off}</Text>
          <Text color={c} bold>{`${Math.round(l.percentUsed)}%`}</Text>
          {reset ? <Text dimColor>{`↻ ${reset}`}</Text> : null}
        </Box>
      )
    })

    return (
      <Box borderStyle="round" borderColor="#565f89" paddingX={1} gap={3}>
        <Text bold color="#7aa2f7">⚡</Text>
        {meters.length > 0 ? meters : <Text dimColor>limiti account non disponibili</Text>}
        {s.contextTokens !== undefined ? (
          <Text dimColor>{`ctx ${fmtTokens(s.contextTokens)}/${fmtTokens(s.contextWindow)}`}</Text>
        ) : null}
        {s.usd !== undefined ? <Text dimColor>{`$${s.usd.toFixed(2)}`}</Text> : null}
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

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

// solo le date di scadenza: i token non escono mai da qui. Su macOS le credenziali
// stanno nel Keychain, il file manca e la chiave non si vede
const readExpiry = async ($: EngineInterface) => {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))}/.claude`
  try {
    const o = JSON.parse(await $.fs.read(`${dir}/.credentials.json`)).claudeAiOauth ?? {}
    const iso = (ms: unknown) => (typeof ms === 'number' ? new Date(ms).toISOString() : undefined)
    return { tokenExpiresAt: iso(o.expiresAt), refreshExpiresAt: iso(o.refreshTokenExpiresAt) }
  } catch {
    return {}
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const u = await $.session.usage()
    const model = await $.session.model()
    const expiry = await readExpiry($)
    await update($, snap, s => ({ ...s, ...toSnap(u), model, ...expiry }))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    // il token si rinnova durante la sessione: rileggo la scadenza a ogni misura
    const expiry = await readExpiry($)
    await update($, snap, s => ({ ...s, ...toSnap(e), ...expiry }))

    return next(e)
  })

  // modello ed effort reali della richiesta, solo loop principale (non subagenti)
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await update($, snap, s => (s ? { ...s, model: e.model, effort: e.effort } : s))
    }

    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)

    if (e.props.hasSurvey || s === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const ctxPct = s.contextPercent ?? (s.contextTokens !== undefined ? (s.contextTokens / s.contextWindow) * 100 : undefined)

    const expiry = (iso: string, at: number) =>
      Date.parse(iso) <= at ? <Text color="#f7768e" bold>scaduto</Text> : <Text dimColor>{until(iso, at)}</Text>

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
          <Box gap={1}>
            <Text dimColor>ctx</Text>
            {ctxPct !== undefined ? <Text color={tone(ctxPct)} bold>{`${Math.round(ctxPct)}%`}</Text> : null}
            <Text dimColor>{`${fmtTokens(s.contextTokens)}/${fmtTokens(s.contextWindow)}`}</Text>
          </Box>
        ) : null}
        {s.model ? (
          <Text color="#bb9af7">{`${s.model.replace(/^claude-/, '')}${s.effort !== undefined ? ` · ${s.effort}` : ''}`}</Text>
        ) : null}
        {s.usd !== undefined ? <Text dimColor>{`$${s.usd.toFixed(2)}`}</Text> : null}
        {s.tokenExpiresAt ? (
          <Box gap={1}>
            <Text dimColor>🔑</Text>
            {expiry(s.tokenExpiresAt, now)}
            {s.refreshExpiresAt ? <Text dimColor>·</Text> : null}
            {s.refreshExpiresAt ? <Text dimColor>login</Text> : null}
            {s.refreshExpiresAt ? expiry(s.refreshExpiresAt, now) : null}
          </Box>
        ) : null}
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const snap = atom({ plugin: 'token-bar', key: 'snap' } as const, null)

const LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7gg', spend_limit: 'spesa' }
// celle della barra in base alla larghezza del terminale; sotto 90 colonne restano solo le percentuali
const barWidth = (cols: number) => (cols >= 150 ? 14 : cols >= 120 ? 10 : cols >= 90 ? 6 : 0)

// verde < 60, giallo < 85, rosso oltre
const tone = (p: number) => (p >= 85 ? '#f7768e' : p >= 60 ? '#e0af68' : '#9ece6a')

const bar = (p: number, width: number) => {
  const n = Math.round((Math.min(100, Math.max(0, p)) / 100) * width)
  return { on: '█'.repeat(n), off: '░'.repeat(width - n) }
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

// solo la scadenza del login (refresh token): i token non escono mai da qui. Su macOS le credenziali
// stanno nel Keychain, il file manca e la chiave non si vede
const readExpiry = async ($: EngineInterface) => {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))}/.claude`
  try {
    const o = JSON.parse(await $.fs.read(`${dir}/.credentials.json`)).claudeAiOauth ?? {}
    return { refreshExpiresAt: typeof o.refreshTokenExpiresAt === 'number' ? new Date(o.refreshTokenExpiresAt).toISOString() : undefined }
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
    // un nuovo login durante la sessione sposta la scadenza: la rileggo a ogni misura
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
    const width = barWidth(e.viewport?.columns ?? 150)
    const ctxPct = s.contextPercent ?? (s.contextTokens !== undefined ? (s.contextTokens / s.contextWindow) * 100 : undefined)

    const meters = s.limits.map(l => {
      const b = bar(l.percentUsed, width)
      const c = tone(l.percentUsed)
      const reset = until(l.resetsAt, now)

      return (
        <Box key={l.kind} gap={1}>
          <Text bold>{LABEL[l.kind] ?? l.kind}</Text>
          {width > 0 ? <Text color={c}>{b.on}</Text> : null}
          {width > 0 ? <Text dimColor>{b.off}</Text> : null}
          <Text color={c} bold>{`${Math.round(l.percentUsed)}%`}</Text>
          {reset ? <Text dimColor>{`↻ ${reset}`}</Text> : null}
        </Box>
      )
    })

    return (
      <Box borderStyle="round" borderColor="#565f89" paddingX={1} flexWrap="wrap" columnGap={3}>
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
        {s.refreshExpiresAt ? (
          <Box gap={1}>
            <Text dimColor>🔑</Text>
            {Date.parse(s.refreshExpiresAt) <= now ? (
              <Text color="#f7768e" bold>scaduto</Text>
            ) : (
              <Text dimColor>{until(s.refreshExpiresAt, now)}</Text>
            )}
          </Box>
        ) : null}
      </Box>
    )
  })
}

import { describe as group, expect, mock, test } from 'claude-code/testing'

import { describe, elapsed, pickName, reroll, roleOf, shortModel } from '../hooks/register'

const PANE = {
  title: 'La Squadra',
  isFocused: false,
  bodyColumns: 46,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

group('agent-squad', () => {
  test('describe picks the most telling argument', async () => {
    expect(describe({ tool: 'Bash', command: 'ls  -la\n /tmp' } as never)).toBe('Bash: ls -la /tmp')
    expect(describe({ tool: 'Read', file_path: 'a.ts' } as never)).toBe('Read: a.ts')
    expect(describe({ tool: 'TodoWrite' })).toBe('TodoWrite')
  })

  test('shortModel keeps family and version', async () => {
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
    expect(shortModel('claude-opus-5-5')).toBe('opus 5.5')
    expect(shortModel('claude-sonnet-4-5[1m]')).toBe('sonnet 4.5')
    expect(shortModel('haiku')).toBe('haiku')
  })

  test('elapsed reads like a stopwatch', async () => {
    expect(elapsed(42_000)).toBe('42s')
    expect(elapsed(125_000)).toBe('2m 05s')
    expect(elapsed(3_720_000)).toBe('1h 02m')
  })

  test('pickName is random and skips names already in use', async () => {
    expect(pickName([], () => 0)).toBe('Gigi Grep')
    expect(pickName(['Gigi Grep'], () => 0)).toBe('Rita Regex')
    expect(pickName([], () => 0.999)).toBe('Gina Git')
  })

  test('reroll renames everyone but the boss, or just one agent', async () => {
    const row = (id: string, name: string) => ({ id, name, type: 'x', description: '', status: 'idle', activity: '' }) as const
    const list = [row('main', 'Il Capo'), row('a1', 'Gigi Grep'), row('a2', 'Rita Regex')]
    const all = reroll(list, '', () => 0)
    expect(all[0].name).toBe('Il Capo')
    expect(all[1].name).not.toBe('Gigi Grep')
    expect(all[2].name).not.toBe('Rita Regex')
    expect(new Set(all.map(a => a.name)).size).toBe(3)
    const one = reroll(list, 'rita regex', () => 0)
    expect(one[1].name).toBe('Gigi Grep')
    expect(one[2].name).not.toBe('Rita Regex')
    expect(reroll(list, 'Il Capo')[0].name).toBe('Il Capo')
  })

  test('roleOf guesses fullstack roles from the agent name', async () => {
    expect(roleOf('Explore').title).toBe('Segugio')
    expect(roleOf('claude').title).toBe('Jolly')
    expect(roleOf('backend-architect').title).toBe('Backendista')
    expect(roleOf('database-optimizer').title).toBe('Archivista')
    expect(roleOf('security-reviewer').title).toBe('Guardiano')
    expect(roleOf('code-reviewer').title).toBe('Revisore')
    expect(roleOf('frontend-developer').title).toBe('Frontendista')
    expect(roleOf('feedback-bot').title).toBe('Agente')
    expect(roleOf('impeccable:impeccable-finish-reviewer').title).toBe('Revisore')
    expect(roleOf('impeccable:impeccable-manual-edit-applier')).toEqual({ logo: '🧩', title: 'Impeccable Manual Edit Applier', role: 'Dal plugin impeccable' })
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`a spawned agent shows up with name, role and status (${surface})`, async ($, on) => {
      on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
      on('turn.complete', () => ({ text: '' }))
      const clock = mock.clock(on, { now: 1_000_000 })
      on('turn.step', async function* (_$, e) {
        return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
      })

      await $.agent.spawn({ prompt: 'cerca', description: 'trova i file di config', subagentType: 'Explore' } as never)
      const ui = await $.ui.mount({ plugin: 'agent-squad', surface, component: 'Pane', requestId: 'agent-squad', props: PANE })
      expect(await ui.find({ text: 'Segugio · trova i file di config' })).toBeDefined()
      expect(await ui.find({ text: '● al lavoro' })).toBeDefined()
      expect(await ui.find({ text: ' · haiku 4.5' })).toBeDefined()

      const step = { turnId: 't1', index: 0, model: 'claude-haiku-4-5', effort: 'high', messageCount: 1, agentId: 'a1' } as const
      await clock.advance(42_000)
      for await (const _ of $.turn.step(step));
      expect(await ui.find({ text: ' · high' })).toBeDefined()
      expect(await ui.find({ text: '● al lavoro · 42s' })).toBeDefined()

      await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok', durationMs: 125_000, isAborted: false, turnId: 't1' })
      expect(await ui.find({ text: '✔ finito · 2m 05s' })).toBeDefined()
    })
  }
})

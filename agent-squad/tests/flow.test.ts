import { describe as group, expect, test } from 'claude-code/testing'

import { alive, fileStats, kindOf, relPath, summarize, toEvent, toPrune } from '../hooks/flow'
import type { Flow, FlowEvent } from '../types'

const ev = (n: number, kind: FlowEvent['kind'], file?: string, ok = true, agent = 'main'): FlowEvent =>
  ({ n, t: n, agent, tool: kind, kind, hint: '', file, ok })

group('agent-squad flow', () => {
  test('kindOf sorts tools into phases', async () => {
    expect(kindOf('Read')).toBe('read')
    expect(kindOf('Grep')).toBe('search')
    expect(kindOf('Edit')).toBe('edit')
    expect(kindOf('Write')).toBe('write')
    expect(kindOf('Bash', 'npm run test')).toBe('verify')
    expect(kindOf('Bash', 'ls -la')).toBe('shell')
    expect(kindOf('Agent')).toBe('agent')
    expect(kindOf('mcp__x__y')).toBe('other')
  })

  test('relPath makes paths under the session relative', async () => {
    expect(relPath('C:\\proj\\src\\a.ts', 'C:\\proj')).toBe('src/a.ts')
    expect(relPath('C:\\other\\b.ts', 'C:\\proj')).toBe('C:/other/b.ts')
  })

  test('toEvent keeps the diff of an Edit and the file only for file tools', async () => {
    const e = toEvent({ tool: 'Edit', file_path: 'C:\\p\\x.ts', old_string: 'a', new_string: 'b' }, 'C:\\p', 1, 0)
    expect(e).toMatchObject({ kind: 'edit', file: 'x.ts', old: 'a', new: 'b', agent: 'main' })
    expect(toEvent({ tool: 'Grep', pattern: 'foo', path: 'src' }, 'C:\\p', 2, 0).file).toBeUndefined()
    expect(toEvent({ tool: 'Agent', description: 'cerca', tool_use_id: 'tu1', agentId: 'a1' }, '', 3, 0)).toMatchObject({ call: 'tu1', agent: 'a1' })
  })

  test('fileStats ranks edited files first and credits their context', async () => {
    const stats = fileStats([
      ev(1, 'read', 'ctx.ts'),
      ev(2, 'read', 'noise.ts'),
      ev(3, 'verify', undefined, false),
      ev(4, 'edit', 'core.ts'),
      ev(5, 'read', 'noise2.ts'),
    ])
    expect(stats[0]?.path).toBe('core.ts')
    expect(stats[0]?.why).toContain('corretto dopo un test fallito')
    const ctx = stats.find(f => f.path === 'ctx.ts')!
    expect(ctx.why).toContain('contesto di una modifica')
    expect(ctx.score).toBeGreaterThan(stats.find(f => f.path === 'noise2.ts')!.score)
  })

  test('summarize keeps only modified files, most crucial first', async () => {
    const touches = [ev(1, 'read', 'a.ts'), ev(2, 'edit', 'b.ts'), ev(3, 'write', 'c.ts'), ev(4, 'edit', 'b.ts')]
    const f: Flow = { agents: [{ id: 'main', type: 'main', description: '', start: 100, status: 'idle' }], events: [ev(4, 'edit', 'b.ts')], prompts: [{ t: 100, text: 'sistema il login' }], touches }
    const s = summarize('s1', 'C:/proj', f, 500)
    expect(s.files.map(x => x.path)).toEqual(['b.ts', 'c.ts'])
    expect(s).toMatchObject({ id: 's1', start: 100, updated: 500, calls: 4, prompt: 'sistema il login' })
  })

  test('toPrune keeps the current session and the most recent ones', async () => {
    const h = [{ id: 'old', updated: 1 }, { id: 'mid', updated: 2 }, { id: 'new', updated: 3 }].map(x => ({ ...x, project: '', start: 0, agents: 0, calls: 0, files: [] }))
    expect(toPrune(['old', 'mid', 'new', 'cur'], h, 'cur', 2)).toEqual(['mid', 'old'])
    expect(toPrune(['old', 'cur'], h, 'cur', 20)).toEqual([])
    expect(toPrune(['unknown', 'new', 'cur'], h, 'cur', 2)).toEqual(['unknown'])
  })

  test('alive keeps recent heartbeats only, the newest first', async () => {
    const b = (id: string, t: number) => ({ id, project: 'C:/p', t })
    expect(alive([b('gone', 0), b('a', 90_000), b('b', 95_000)], 100_000).map(x => x.id)).toEqual(['b', 'a'])
  })
})

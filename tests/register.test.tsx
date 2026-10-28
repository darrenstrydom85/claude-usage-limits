import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-limits',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const MEASURE = {
  context: { window: 200000, tokens: 50000, percent: 25 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-28T12:14:00Z' },
    { kind: 'seven_day', percentUsed: 91.5, resetsAt: '2026-10-31T14:00:00Z' },
  ],
  cost: { usd: 1.234 },
  changed: ['context', 'rateLimits', 'cost'],
} as const

test('desktop draws the crab and a gauge per limit', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-10-28T10:00:00Z') }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const tree = (await ui.drawn()) as {
    type: string
    props: { source: string; isInteractive: boolean; width: number; height: number }
  }
  expect(tree.type).toBe('Svg')
  expect(tree.props.isInteractive).toBe(true)
  expect(tree.props.height).toBe(36)
  expect(tree.props.source).toContain('width="100%"')
  const svg = tree.props.source
  expect(svg).toContain('class="crab"')
  expect(svg).toMatch(/5H<\/text>[\s\S]*42%[\s\S]*↻ 2h 14m/)
  expect(svg).toMatch(/7D<\/text>[\s\S]*92%[\s\S]*↻ 3d 4h/)
  expect(svg).toContain('pulse 1.6s')
  expect(svg).toContain('class="sweat"')
  expect(svg).toContain('$1.23')
  await ui.unmount()
})

test('terminal falls back to one line of text bars', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-10-28T10:00:00Z') }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const line = (await ui.find({ type: 'Text', text: /5h/ }))?.text ?? ''
  expect(line).toMatch(/5h ━{10} 42% ↻ 2h 14m/)
  expect(line).toMatch(/7d ━{10} 92% ↻ 3d 4h/)
  expect(line).toMatch(/\$1\.23/)
  await ui.unmount()
})

test('with no reading the band leaves the engine its own', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

// One main-thread response; its usage is whatever the stubbed engine below answers.
const reply = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
  while (!(await s.next()).done) {
    // drain the stream: the hook records the cache once the response is whole
  }
}

const cacheSetup = (on: Parameters<Parameters<typeof test>[1]>[1], clock: { now: number }, usage: { read: number; write: number; input: number }) => {
  const stored: Record<string, unknown> = {}
  on('clock.now', () => ({ value: clock.now }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('store.get', (_, e) => ({ value: stored[e.key] }))
  on('store.set', (_, e) => ((stored[e.key] = e.value), { value: undefined }))
  on('turn.step', async function* () {
    return {
      turnId: 't',
      index: 0,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: 'claude-opus-5-5',
        input_tokens: usage.input,
        output_tokens: 10,
        cache_read_input_tokens: usage.read,
        cache_creation_input_tokens: usage.write,
      },
    } as never
  })
  return stored
}

test('the cache gauge counts down from the last reply and shows its hit rate', async ($, on) => {
  const clock = { now: Date.parse('2026-10-28T10:00:00Z') }
  const usage = { read: 97000, write: 2000, input: 1000 }
  cacheSetup(on, clock, usage)
  await $.session.measure(MEASURE)
  await reply($)
  clock.now += 90_000

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = ((await desktop.drawn()) as { props: { source: string } }).props.source
  expect(svg).toContain('class="merc"')
  expect(svg).toContain('the last reply read 97% of its input from the cache')
  // 5m time to live, 90s gone: 210s left, ticking 4m, 3m, 2m, 1m, then cold.
  expect(svg).toMatch(/>4m<\/text>[\s\S]*>&lt;1m<\/text>[\s\S]*>cold<\/text>/)
  expect(svg).toMatch(/animation: drain 210s linear forwards/)
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const line = (await terminal.find({ type: 'Text', text: /cache/ }))?.text ?? ''
  expect(line).toMatch(/cache ━{7}━{3} 4m · 97% hit/)
  await terminal.unmount()
})

test('while Claude works the cache is hot', async ($, on) => {
  const clock = { now: Date.parse('2026-10-28T10:00:00Z') }
  cacheSetup(on, clock, { read: 5, write: 5, input: 0 })
  await $.session.measure(MEASURE)
  await reply($)

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true }, surface: 'desktop' })
  const svg = ((await ui.drawn()) as { props: { source: string } }).props.source
  expect(svg).toContain('class="pct hot-t" x="24" y="22.5">hot</text>')
  await ui.unmount()
})

test('a cache hit after more than five idle minutes proves the one-hour cache', async ($, on) => {
  const clock = { now: Date.parse('2026-10-28T10:00:00Z') }
  const usage = { read: 0, write: 50000, input: 100 }
  const stored = cacheSetup(on, clock, usage)
  await $.session.measure(MEASURE)
  await reply($)
  clock.now += 20 * 60_000
  usage.read = 50000
  usage.write = 300
  await reply($)

  expect(stored.cacheTtl).toBe('1h')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = ((await ui.drawn()) as { props: { source: string } }).props.source
  expect(svg).toContain('(1h time to live)')
  expect(svg).toMatch(/>60m<\/text>/)
  await ui.unmount()
})

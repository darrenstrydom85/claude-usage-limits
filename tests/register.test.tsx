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

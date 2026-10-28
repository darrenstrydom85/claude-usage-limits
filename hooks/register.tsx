import { atom, read, update } from 'claude-code'
import type { Register, SessionMeasureInput } from 'claude-code'

import type { Cache, Usage } from '../types'

const usage = atom({ plugin: 'usage-limits', key: 'usage' } as const, { limits: [] } as Usage, {
  shape: 'usage-1',
})
const cache = atom({ plugin: 'usage-limits', key: 'cache' } as const, null as Cache | null, { shape: 'cache-1' })

// [short label drawn on the band, long label in the tooltip]
const LABELS: Record<string, [string, string]> = {
  five_hour: ['5h', '5-hour window'],
  seven_day: ['7d', 'Weekly'],
  seven_day_opus: ['7d opus', 'Weekly · Opus'],
  seven_day_sonnet: ['7d sonnet', 'Weekly · Sonnet'],
  spend_limit: ['spend', 'Spend limit'],
  context: ['ctx', 'Context window'],
  cache: ['cache', 'Prompt cache'],
}

// The cache row's `pct` is how much of its time to live is left; `left` in seconds.
type Row = { kind: string; pct: number; resets: string; cache?: { left: number; isHot: boolean; ttl: Cache['ttl'] } }

const toUsage = (u: Pick<SessionMeasureInput, 'rateLimits' | 'context' | 'cost'>): Usage => ({
  limits: u.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
  contextPercent: u.context.percent,
  costUsd: u.cost?.usd,
})

const tone = (pct: number) => (pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'success')
const clamp = (pct: number) => Math.min(100, Math.max(0, pct))
const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)

// ponytail: relative to the last redraw; redraws come with each measure (every turn), no ticking timer
const until = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

const cacheRow = (c: Cache, now: number, isWorking: boolean): Row => {
  const ttlMs = TTL_MS[c.ttl]
  const left = isWorking ? ttlMs / 1000 : Math.max(0, (c.at + ttlMs - now) / 1000)
  const total = c.read + c.write + c.input
  const hit = total ? Math.round((c.read / total) * 100) : 0

  return { kind: 'cache', pct: ((left * 1000) / ttlMs) * 100, resets: `${hit}% hit`, cache: { left, isHot: isWorking, ttl: c.ttl } }
}

const cacheText = (r: Row) =>
  r.cache?.isHot ? 'hot' : (r.cache?.left ?? 0) <= 0 ? 'cold' : r.cache!.left <= 60 ? '<1m' : `${Math.ceil(r.cache!.left / 60)}m`

// The cache's temperature as it cools: hot orange, peach halfway, cold blue.
const HOT = [240, 120, 74]
const MID = [242, 184, 128]
const COLD = [90, 169, 230]
const heat = (g: number) => {
  const [a, b, t] = g >= 0.5 ? [MID, HOT, (g - 0.5) * 2] : [COLD, MID, g * 2]
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(',')})`
}

const GRADIENTS = {
  success: ['#2F9E62', '#62D697'],
  warning: ['#D4951F', '#F5C451'],
  error: ['#D63E33', '#F27A60'],
  hot: ['#D97757', '#F5A25D'],
}
const H = 36
// ponytail: asks for a frame wider than any chat column and lets the surface clamp it to the band; measure the slot if a surface stops clamping
const FRAME = 3840
const L0 = 68 // where the first segment starts, past the crab
const G = 28 // between segments, a divider in the middle

// Where each bar was last drawn (0 to 1), so a redraw grows it from there rather than from empty.
const drawn = new Map<string, number>()

// The Claude Code mascot on an 18×5 pixel grid: body, side claws, eyes, four legs.
const crab = (isWorking: boolean, isSweating: boolean) => `
  <g class="crab${isWorking ? ' busy' : ''}" transform="translate(16 9)">
    <title>Claude${isWorking ? ' is working' : ''}</title>
    <rect x="-4" y="-6" width="44" height="30" fill="transparent"/>
    <g class="bob">
      <g transform="scale(2 3.6)" shape-rendering="crispEdges" fill="#D97757">
        <rect x="3" y="0" width="12" height="4"/>
        <rect class="arm" x="1" y="2" width="2" height="1"/>
        <rect class="arm" x="15" y="2" width="2" height="1"/>
        <rect class="eye" x="5" y="1" width="1" height="1" fill="#1a1a1a"/>
        <rect class="eye" x="12" y="1" width="1" height="1" fill="#1a1a1a"/>
        <rect class="leg" x="4" y="4" width="1" height="1"/>
        <rect class="leg b" x="6" y="4" width="1" height="1"/>
        <rect class="leg" x="11" y="4" width="1" height="1"/>
        <rect class="leg b" x="13" y="4" width="1" height="1"/>
      </g>
      ${isSweating ? '<path class="sweat" d="M38 -3q2.4 3.4 0 4.6q-2.4-1.2 0-4.6z" fill="#7CC4F2"/>' : ''}
    </g>
  </g>`

// Drawn on its own dark capsule, so it reads the same in a light or dark app.
const STYLE = `
  text { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-variant-numeric: tabular-nums; }
  :root, body { margin: 0; overflow: hidden; }
  .capsule { width: calc(100% - 1px); }
  .fg { fill: #F2F0EB; } .muted { fill: #8C8A85; } .track { fill: rgba(255,255,255,.08); transition: fill .2s; }
  .rule { stroke: rgba(255,255,255,.1); } .pill { fill: none; stroke: rgba(255,255,255,.14); }
  .seg:hover .track { fill: rgba(255,255,255,.16); }
  .label { font-size: 10px; font-weight: 600; letter-spacing: .08em; }
  .pct { font-size: 13px; font-weight: 600; } .reset { font-size: 10.5px; }
  .hot-t { fill: #F5A25D; } .cold-t { fill: rgb(${COLD.join(',')}); }
  .tick { opacity: 0; } .merc { transform-box: fill-box; transform-origin: 50% 100%; }
  .bob { animation: bob 2.6s ease-in-out infinite; }
  .busy .bob { animation: scuttle .9s ease-in-out infinite; }
  .eye { transform-box: fill-box; transform-origin: center; animation: blink 5s infinite; }
  .busy .leg { animation: step .3s steps(1) infinite; } .busy .leg.b { animation-delay: .15s; }
  .crab:hover .arm { animation: wave .3s ease-in-out infinite alternate; }
  .sweat { animation: drip 1.6s ease-in infinite; }
  @keyframes bob { 50% { transform: translateY(-1.5px); } }
  @keyframes scuttle { 0%, 100% { transform: translateX(-2px); } 50% { transform: translateX(2px); } }
  @keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(.15); } }
  @keyframes step { 50% { transform: translateY(-.5px); } }
  @keyframes wave { to { transform: translateY(-1px); } }
  @keyframes drip { 0% { opacity: 0; transform: translateY(-2px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(7px); } }
  @keyframes pulse { 50% { opacity: .55; } }
  @keyframes show { from, to { opacity: 1; } }
  @keyframes appear { to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } .tick.first { opacity: 1; } }`

// Places a piece at `frac` of the band's width plus `px` pixels: n segments and the cost pill share any width exactly.
const at = (frac: number, px: number, body: string) =>
  `<svg x="${(frac * 100).toFixed(4)}%" overflow="visible"><g transform="translate(${px.toFixed(2)} 0)">${body}</g></svg>`

type Shown = Row & { label: string; long: string; pctText: string; q: number; from: number }

// The cache chip: a thermometer whose mercury drains and cools in CSS alone over the seconds the
// cache has left, and a countdown that is one text per minute shown in turn, so it stays true between redraws.
const CHIP_W = 66
const cacheChip = (r: Row) => {
  const { left, isHot, ttl } = r.cache!
  const L = Math.round(left)
  const g = clamp(r.pct) / 100
  const css: string[] = []
  let texts = ''

  if (isHot) {
    css.push(`.merc { transform: scaleY(1); fill: #F5A25D; } .bulb { fill: #F5A25D; }
      .thermo { filter: drop-shadow(0 0 3px #F5A25D); animation: pulse 1.6s ease-in-out infinite; }`)
    texts = '<text class="pct hot-t" x="24" y="22.5">hot</text>'
  } else if (L <= 0) {
    css.push(`.merc { transform: scaleY(0); } .bulb { fill: rgb(${COLD.join(',')}); }`)
    texts = '<text class="pct cold-t" x="24" y="22.5">cold</text>'
  } else {
    const half = g > 0.5 ? `${((1 - 0.5 / g) * 100).toFixed(1)}% { fill: ${heat(0.5)}; } ` : ''
    css.push(`.merc { transform: scaleY(${g.toFixed(4)}); fill: ${heat(g)}; animation: drain ${L}s linear forwards, cool ${L}s linear forwards; }
      .bulb { fill: ${heat(g)}; animation: cool ${L}s linear forwards; }
      .thermo { filter: drop-shadow(0 0 2px ${heat(g)}); }
      @keyframes drain { to { transform: scaleY(0); } }
      @keyframes cool { ${half}to { fill: rgb(${COLD.join(',')}); } }`)
    for (let X = Math.ceil(L / 60); X >= 1; X--) {
      const start = Math.max(0, L - X * 60)
      css.push(`.cx${X} { animation: show ${L - (X - 1) * 60 - start}s linear ${start}s; }`)
      texts += `<text class="pct fg tick${start === 0 ? ' first' : ''} cx${X}" x="24" y="22.5">${X === 1 ? '&lt;1m' : `${X}m`}</text>`
    }
    css.push(`.cx0 { animation: appear .01s linear ${L}s forwards; }`)
    texts += '<text class="pct cold-t tick cx0" x="24" y="22.5">cold</text>'
  }

  const state = isHot
    ? 'hot: Claude is using it right now'
    : L <= 0
      ? 'cold: your next message rebuilds it'
      : `warm for about ${cacheText(r)} more (${ttl} time to live${ttl === '5m' ? ', until a later reply shows it is 1h' : ''})`
  const svg = `
    <g class="seg"><title>Prompt cache · ${state} · the last reply read ${r.resets.replace(' hit', '')} of its input from the cache</title>
      <rect class="pill" x="0" y="9" width="${CHIP_W}" height="18" rx="9"/>
      <g class="thermo">
        <rect x="11.5" y="11.5" width="5" height="11" rx="2.5" fill="rgba(255,255,255,.1)"/>
        <rect class="merc" x="12.75" y="13" width="2.5" height="10" rx="1.25"/>
        <circle class="bulb" cx="14" cy="22.5" r="3.4"/>
      </g>
      ${texts}
    </g>`

  return { css: css.join('\n'), svg }
}

// ponytail: text widths are estimated from character counts, no font metrics in a hooks module
// One layout of the segments, under class `k`: bars stretch to fill whatever width the band has.
const segments = (shown: Shown[], R: number, withResets: boolean, k: string) => {
  const n = shown.length
  const LW = Math.max(...shown.map(r => r.label.length)) * 6.6 + 10
  const RW = Math.max(...shown.map(r => r.pctText.length * 7.8 + (withResets && r.resets ? 6 + (r.resets.length + 2) * 5.9 : 0))) + 6
  // Segment i starts at i/n of the width plus off(i); its bar takes what its label and figures leave: W/n - barK.
  const off = (i: number) => L0 + (i * (G - L0 - R)) / n
  const barK = (L0 + R - G) / n + G + LW + RW + 10
  const barW = (q: number) =>
    q <= 0 ? '0px' : `max(6px, calc(${((q * 100) / n).toFixed(4)}% - ${(q * barK).toFixed(2)}px))`
  const css: string[] = []
  const parts: string[] = []

  shown.forEach((r, i) => {
    const t = tone(r.pct)
    const anims = [
      r.from !== r.q ? `${k}grow${i} .9s cubic-bezier(.2,.8,.2,1) both` : '',
      t === 'error' ? 'pulse 1.6s ease-in-out infinite' : '',
    ].filter(Boolean)
    css.push(`.${k}f${i} { width: ${barW(r.q)}; filter: drop-shadow(0 0 3px ${GRADIENTS[t][1]}80);${anims.length ? ` animation: ${anims.join(', ')};` : ''} }`)
    if (r.from !== r.q) css.push(`@keyframes ${k}grow${i} { from { width: ${barW(r.from)}; } }`)
    css.push(`.${k}t${i} { width: ${barW(1)}; }`)

    if (i > 0) parts.push(at(i / n, off(i) - G / 2, '<line class="rule" x1="0" y1="12" x2="0" y2="24"/>'))
    parts.push(`
      <g class="seg">
        <title>${esc(r.long)} · ${r.pctText} used${r.resets ? ` · resets in ${esc(r.resets)}` : ''}</title>
        ${at(i / n, off(i), `
          <text class="label muted" x="0" y="21.5">${esc(r.label)}</text>
          <rect class="track ${k}t${i}" x="${LW.toFixed(2)}" y="15" height="6" rx="3"/>
          <rect class="${k}f${i}" x="${LW.toFixed(2)}" y="15" height="6" rx="3" fill="url(#${t})"/>`)}
        ${at((i + 1) / n, off(i) + LW - barK + 10, `
          <text class="pct fg" x="0" y="22.5">${r.pctText}</text>
          ${withResets && r.resets ? `<text class="reset muted" x="${r.pctText.length * 7.8 + 6}" y="22">↻ ${esc(r.resets)}</text>` : ''}`)}
      </g>`)
  })

  // Below this width the bars would shrink under 40px.
  return { css: css.join('\n'), svg: `<g class="${k}">${parts.join('')}</g>`, minWidth: Math.round(n * (barK + 40)) }
}

const band = (rows: Row[], cached: Row | undefined, costUsd: number | undefined, isWorking: boolean) => {
  const peak = Math.max(...rows.map(r => r.pct))
  const cost = costUsd === undefined ? '' : `$${costUsd.toFixed(2)}`
  const pw = cost ? cost.length * 6.6 + 18 : 0
  const cw = cached ? CHIP_W + (cost ? 10 : 0) : 0
  const R = cost || cached ? pw + cw + 14 + G : 18 // kept clear at the right end
  const shown: Shown[] = rows.map(r => {
    const [short, long] = LABELS[r.kind] ?? [r.kind, r.kind]
    const q = clamp(r.pct) / 100
    const from = drawn.get(r.kind) ?? 0
    drawn.set(r.kind, q)
    return { ...r, label: short.toUpperCase(), long, pctText: `${Math.round(r.pct)}%`, q, from }
  })
  // The full layout, and a compact one without reset times that takes over where the full one gets cramped.
  const wide = segments(shown, R, true, 'w')
  const narrow = segments(shown, R, false, 'n')
  // The right end: the cache chip, then the cost pill.
  const chip = cached ? cacheChip(cached) : undefined
  const right =
    (cost || chip ? at(1, -14 - pw - cw - G / 2, '<line class="rule" x1="0" y1="12" x2="0" y2="24"/>') : '') +
    (chip ? at(1, -14 - pw - cw, chip.svg) : '') +
    (cost
      ? `<g><title>Session cost</title>${at(1, -14 - pw, `
        <rect class="pill" x="0" y="9" width="${pw}" height="18" rx="9"/>
        <text class="reset muted" x="9" y="21.5">${cost}</text>`)}</g>`
      : '')
  const stops = Object.entries(GRADIENTS)
    .map(([id, [a, b]]) => `<linearGradient id="${id}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}">
    <style>${STYLE}
      ${wide.css}
      ${narrow.css}
      ${chip?.css ?? ''}
      .n { display: none; }
      @media (max-width: ${wide.minWidth}px) { .w { display: none; } .n { display: inline; } }
    </style>
    <defs>${stops}<linearGradient id="capsule" x2="0" y2="1"><stop offset="0" stop-color="#2A2927"/><stop offset="1" stop-color="#1C1B1A"/></linearGradient></defs>
    <rect class="capsule" x=".5" y=".5" height="${H - 1}" rx="${(H - 1) / 2}" fill="url(#capsule)" stroke="rgba(255,255,255,.08)"/>
    ${crab(isWorking, peak >= 90)}
    ${wide.svg}
    ${narrow.svg}
    ${right}
  </svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    const now = await $.session.usage()
    await update($, usage, () => toUsage(now))

    return ran
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e))

    return next(e)
  })

  // Each main-thread response refreshes the prompt cache; subagents keep caches of their own.
  on('turn.step', async function* ($, e, next) {
    const sentAt = await $.clock.now()
    const r = yield* next(e)

    if (e.agentId || !r.usage) {
      return r
    }

    const prev = await read($, cache)
    let ttl: Cache['ttl'] = prev?.ttl ?? ((await $.store.get('cacheTtl')) === '1h' ? '1h' : '5m')
    // A cache hit after more than five idle minutes can only be the one-hour cache; remembered for later sessions.
    if (ttl === '5m' && prev && sentAt - prev.at > TTL_MS['5m'] + 30_000 && r.usage.cache_read_input_tokens > 0) {
      ttl = '1h'
      await $.store.set('cacheTtl', ttl)
    }
    const landed = await $.clock.now()
    const { cache_read_input_tokens: hits, cache_creation_input_tokens: write, input_tokens: input } = r.usage
    await update($, cache, () => ({ at: landed, read: hits, write, input, ttl }))

    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, usage)

    if (e.props.hasSurvey || (u.limits.length === 0 && u.contextPercent === undefined)) {
      return next(e)
    }

    const now = await $.clock.now()
    const c = await read($, cache)
    const rows: Row[] = [
      ...u.limits.map(l => ({ kind: l.kind, pct: l.percentUsed, resets: until(l.resetsAt, now) })),
      ...(u.contextPercent === undefined ? [] : [{ kind: 'context', pct: u.contextPercent, resets: '' }]),
    ]
    const cached = c ? cacheRow(c, now, e.props.isWorking) : undefined
    const table = $.ui.resolve(e)

    if (e.surface !== 'terminal' && 'Svg' in table) {
      const { Svg } = table
      const alt = [
        ...rows.map(r => `${(LABELS[r.kind] ?? [r.kind, r.kind])[1]} ${Math.round(r.pct)}%`),
        ...(cached ? [`Prompt cache ${cacheText(cached)}`] : []),
      ].join(', ')

      // The interactive frame ignores the markup's size and falls back to 300×150, so size it here.
      return <Svg source={band(rows, cached, u.costUsd, e.props.isWorking)} width={FRAME} height={H} alt={alt} isInteractive />
    }

    // Terminal: no Svg there, so one line of text bars.
    const { Text } = table

    return (
      <Text wrap="truncate-end">
        {[...rows, ...(cached ? [cached] : [])].map((r, i) => {
          const filled = Math.round((clamp(r.pct) / 100) * 10)
          const color = r.cache ? heat(r.pct / 100) : tone(r.pct)

          return (
            <Text>
              {i > 0 && <Text dimColor>{'  │  '}</Text>}
              <Text dimColor>{(LABELS[r.kind] ?? [r.kind])[0]} </Text>
              <Text color={color}>{'━'.repeat(filled)}</Text>
              <Text dimColor>{'━'.repeat(10 - filled)}</Text>
              <Text bold color={r.cache || r.pct >= 70 ? color : undefined}> {r.cache ? cacheText(r) : `${Math.round(r.pct)}%`}</Text>
              {r.resets !== '' && <Text dimColor> {r.cache ? `· ${r.resets}` : `↻ ${r.resets}`}</Text>}
            </Text>
          )
        })}
        {u.costUsd !== undefined && <Text dimColor>{'  │  '}${u.costUsd.toFixed(2)}</Text>}
      </Text>
    )
  })
}

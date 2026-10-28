<div align="center">

<img src="assets/hero.svg" alt="The usage-limits band sitting above the Claude Code prompt: a pixel crab, then gauges for the 5-hour window, the weekly window and the context window, and the session cost" width="100%">

<h1>usage-limits</h1>

<p><strong>Your Claude usage limits, at a glance.</strong><br>
One slim, animated line above the prompt: rate limits, reset countdowns, context and cost.</p>

<p>
<img src="https://img.shields.io/badge/Claude%20Code-mod-D97757?style=for-the-badge&labelColor=1C1B1A" alt="Claude Code mod">
<img src="https://img.shields.io/badge/desktop%20%2B%20terminal-supported-2F9E62?style=for-the-badge&labelColor=1C1B1A" alt="Desktop and terminal">
<img src="https://img.shields.io/badge/setup-zero%20config-8C8A85?style=for-the-badge&labelColor=1C1B1A" alt="Zero config">
</p>

<p>
<a href="#-install"><strong>Install</strong></a> ·
<a href="#-what-you-get"><strong>What you get</strong></a> ·
<a href="#-every-state"><strong>Every state</strong></a> ·
<a href="#-in-the-terminal"><strong>Terminal</strong></a> ·
<a href="#-faq"><strong>FAQ</strong></a>
</p>

</div>

<br>

## ⚡ Install

At the prompt of a terminal session:

```
/plugin install usage-limits --marketplace darrenstrydom85/claude-usage-limits
```

Answer `y` to add the marketplace, then pick the **user** scope so the band shows in every session.

<details>
<summary><strong>From a shell, or the desktop app</strong></summary>

<br>

From a shell:

```bash
claude plugin install usage-limits --marketplace darrenstrydom85/claude-usage-limits
```

In Claude Code Desktop, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `darrenstrydom85/claude-usage-limits`, then **Add plugin**.

A plugin installed from a terminal at the user scope loads in the desktop app's local sessions too.

</details>

That's it: no config, no keys, no network calls. The band appears after your next reply.

## ✨ What you get

| | |
|---|---|
| ⏱️ **Rate limits** | Your 5-hour and weekly windows, plus Opus, Sonnet or spend-limit windows when your plan reports them |
| ↻ **Reset countdowns** | How long until each window resets, right next to its bar |
| 🧠 **Context window** | How full the live context is, so you know when a compact is coming |
| 💸 **Session cost** | What this session has cost so far, in a little pill on the right |
| 🚦 **Colour that means something** | Green, then amber from 70%, then red from 90%, with a glow, and red bars pulse |
| 🦀 **A tiny crab** | It bobs and blinks while idle, scuttles while Claude works, waves when you hover it, and sweats once any limit passes 90% |
| 🔍 **Hover for detail** | Each gauge's full name, percentage and reset time in a tooltip |
| 📐 **Fits any width** | Stretches across the full band, and drops the reset times when space is tight |
| 🌗 **Light or dark** | Drawn on its own dark capsule, so it reads the same in either theme |
| ♿ **Respects reduced motion** | Every animation stops when your system asks for less motion |

## 🎨 Every state

<img src="assets/states.svg" alt="Four bands: calm and all green; working with the crab scuttling; warming up with amber bars past 70%; and red hot with pulsing red bars past 90% and a sweating crab" width="100%">

## 💻 In the terminal

The terminal can't draw SVG, so there the band falls back to a single line of text bars in the same colours.

<img src="assets/terminal.svg" alt="The terminal version: one line of text bars for 5h, 7d and context with reset times and the session cost, above the prompt box" width="100%">

## ❓ FAQ

<details>
<summary><strong>The 5h and 7d gauges are missing</strong></summary>

<br>

Rate-limit figures arrive with Claude's API responses, so they show up after the first reply of a session. They only exist on a Claude subscription; with an API key you'll see context and cost alone.

</details>

<details>
<summary><strong>Can I hide it for a moment?</strong></summary>

<br>

Yes: collapse the band with the `[-]` beside it, or `ctrl+x ctrl+a`.

</details>

<details>
<summary><strong>Does it send my usage anywhere?</strong></summary>

<br>

No. It reads the figures Claude Code already has (the same ones the status line uses) and draws them. It makes no network calls and writes no files.

</details>

<details>
<summary><strong>How do I uninstall it?</strong></summary>

<br>

```bash
claude plugin uninstall usage-limits
```

</details>

## 🔧 How it works

It's a single hooks module, [`hooks/register.tsx`](hooks/register.tsx):

- **`session.measure`** pushes fresh figures after every turn and whenever a rate-limit window moves a whole point. The mod keeps the latest in session state.
- **`ui.render`** on the `AbovePrompt` band draws them: an interactive SVG on desktop, laid out in percentages so it fills any width, or a line of text in the terminal.

To hack on it, clone the repository and run:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

<br>

<div align="center">
<sub>Built with <a href="https://claude.com/claude-code">Claude Code</a> · the images above are drawn by the mod itself</sub>
</div>

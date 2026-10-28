# usage-limits

A Claude Code mod that puts your usage limits on one line right above the prompt, so you can see them at a glance.

- **5-hour and weekly rate limits** (plus any Opus, Sonnet or spend-limit windows your plan reports), each with a gradient bar, the percentage used and a countdown to the reset
- **Context window** fill and **session cost**
- Bars go green, amber at 70% and red at 90% (red ones pulse)
- A little pixel Claude crab that bobs, blinks, scuttles while Claude is working, waves when you hover it, and sweats once any limit passes 90%
- Hover a gauge for its full name and reset time
- Stretches to the full width of the band and drops the reset times when space is tight

In Claude Code Desktop it draws as an animated SVG on its own dark capsule, so it reads the same in light and dark themes. In the terminal it falls back to a single line of text bars.

Rate-limit figures come from Claude's API responses, so they appear after the first reply of a session and only on subscription plans.

## Install

At the prompt of a terminal session:

```
/plugin install usage-limits --marketplace darrenstrydom85/claude-usage-limits
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every session.

From a shell:

```
claude plugin install usage-limits --marketplace darrenstrydom85/claude-usage-limits
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `darrenstrydom85/claude-usage-limits`, then Add plugin.

## Uninstall

```
claude plugin uninstall usage-limits
```

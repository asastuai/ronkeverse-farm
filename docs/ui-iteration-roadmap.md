# UI Iteration Roadmap

Automated visual review loop using Puppeteer. Screenshots saved to `screenshots/<iteration>/`.

## How it works

1. Dev server running on `localhost:3030`
2. `node scripts/screenshot.mjs <iteration-name>` captures desktop + mobile of `/` and `/about`
3. Review screenshots, identify issues, fix code, repeat
4. Each iteration documented below

## Iteration log

### Baseline (initial state)

Issues identified:

🔴 **CRITICAL**
- #1 — "Connect Ronin Wallet" button visible in nav even in demo mode (confusing)
- #2 — Next.js dev indicator "N" badge bottom-left
- #3 — Speech bubbles on boss + worker4 show same text simultaneously (not desynced)
- #4 — Sun + Moon visible together during transition frames

🟠 **HIGH — Mobile UX**
- #5 — Nav on mobile overcrowded: "RONKEVERSE FARM" wraps to 2 lines + "About" + "Connect Wallet"
- #6 — RonkeWorkScene on mobile: workers pile up in center
- #7 — About page hero feels tight on mobile

🟡 **MEDIUM — Polish**
- #8 — Empty plantations state has no visual icon
- #9 — Workers' carried banana emoji feels small
- #10 — Demo mode banner pill feels orphaned
- #11 — Hero title could have more drama

### Iteration 1+2 — Critical + Mobile (✅)

**Changes**:
- ✅ Hide Connect Ronin Wallet in nav when `NEXT_PUBLIC_DEMO_MODE=true`
- ✅ Disabled Next.js dev indicator (`devIndicators: false` in `next.config.mjs`)
- ✅ Desynced speech bubble timings: boss rotates every 6s, worker4 every 9.2s with offset start
- ✅ Sun/moon cycle extended to 180s with clearer non-overlapping transitions
- ✅ Mobile nav: "RONKEVERSE FARM" hidden on mobile (`hidden sm:inline`)
- ✅ Workers 4 & 5 hidden on mobile (`display: none` until `@media >= 640px`)
- ✅ Worker walking range tightened: 18% → 78% (was 14% → 80%) to give boss more space
- ✅ Worker carry banana emoji: 18px → 22px

**Result**: Mobile nav clean, scene not crowded, no dev indicator, speech bubbles desynced.

### Iteration 3 — Polish (✅)

**Changes**:
- ✅ Hero title: `text-5xl sm:text-8xl` → `text-6xl sm:text-9xl` (bigger drama)
- ✅ Hero gradient enhanced: 4-stop instead of 3 (more yellow at top, blue at bottom)
- ✅ Hero drop-shadow glow: 32px → 40px, 0.3 → 0.45 opacity
- ✅ Demo Mode banner redesigned: gradient background, pulsing dot, integrated with other cards
- ✅ Reset demo button: now uses `btn-secondary` (consistent with rest of UI)
- ✅ Empty plantations state: added 🌱 icon + centered layout + better copy
- ✅ Day/night cycle extended to 180s for slower, more natural transitions
- ✅ Stars and moon timing aligned with night portion (52%–78% of cycle)

**Result**: Hero feels premium, demo banner integrated, empty state has personality.

## Files touched across all iterations

- `app/next.config.mjs` — disable dev indicators
- `app/src/app/page.tsx` — Connect button conditional, hero font size, nav text responsive
- `app/src/app/about/page.tsx` — nav text responsive
- `app/src/app/globals.css` — hero title styling, day/night cycle timing, worker positions, speech bubble timing
- `app/src/components/RonkeWorkScene.tsx` — speech bubble state desync
- `app/src/components/farm/DemoFarmDashboard.tsx` — demo header redesign, empty state with icon

## Next iteration candidates (not blocking)

- Scroll cue indicator at bottom of hero (animated chevron)
- Footer redesign with more identity
- Loading skeletons while components mount
- Mobile pull-to-refresh styling
- Accessibility audit (focus rings, contrast checks)

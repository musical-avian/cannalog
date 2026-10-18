# CLAUDE.md

Private medical cannabis log. Static PWA, browser-only, GitHub Pages. No framework, no build step. Data never leaves the device except by user export.

## First
1. Read `plan.md` (blackboard). Claim a task there before working, update Facts/Decisions/Log after.
2. Keep `docs/` in sync with code: math → `docs/formulas.md`, numbers + sources → `docs/sources.md`, data shape → `docs/data.md`, evidence/limits → `docs/limits.md`.

## Rules
- DRY, KISS, YAGNI, SOLID. Small code. No new dependency unless it clearly beats ~50 lines of own code.
- **3am rule:** code must be debuggable at 3am by a tired, impaired human.
  - Plain names (`thcMg`, not `t`). No clever one-liners, chained ternaries or reduce-golf.
  - Flat control flow, early returns, small functions doing one thing.
  - Named constants, no magic numbers.
  - Errors name the item + bad value (`entry e1: amount -5 must be > 0`). Never fail silently, never overwrite unreadable saved data.
  - Comments say *why*, not what.
- **No number without a source.** Every constant in `calc.js` is in `SOURCES` and `docs/sources.md` (test enforces).
- Every value has an evidence level (measured / derived / assumed); anything not measured is in `docs/limits.md`.
- No network calls at runtime. No analytics. No CDN.
- Math/data changes need a test. Data shape changes bump `version` + migration.
- Educational/personal log: never phrase output as dosing advice.
- Generic names only (no brands in code/docs except as user data).

## Layout (dependency: app → store → calc)
| File | Role |
|---|---|
| `calc.js` | pure math: mg per entry (raw/decarb/absorbed), ratio, dates, summaries, trends |
| `store.js` | data shape, validation, localStorage, JSON/CSV backup, merge |
| `app.js` | DOM only: views, dialogs, charts, events |
| `index.html` | markup + CSS (mobile first, light/dark) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | offline + install |
| `vendor/` | uPlot 1.6.32 (MIT), vendored on purpose |

## Debug
- Console: `cannalog.dump()`, `cannalog.state`.
- URL `?debug` → raw JSON in Settings.
- Saved data at localStorage key `cannalog.v1`.

## Commands
```sh
make test   # node --test
make lint   # biome ci   (make fmt to fix)
make serve  # python http.server on :8080
```
## Release
Develop on `claude/cannabis-use-logger-rtgc0v`. After `make lint` + `make test` pass: push the branch, then `git push origin HEAD:main` (fast-forward only, never force). `main` = live site.

CI (`.github/workflows/check.yml`): lint → test. Pages = "Deploy from a branch" (`main`, root): pushing to `main` publishes. `.nojekyll` = serve files as-is.

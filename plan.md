# plan.md — blackboard

Shared state for humans and agents. Read first, write back after. Newest log entry on top.

## Goal
Log medical cannabis use on a phone: strain, THC/CBD (% or mg), amount, active mg, multiple uses/day with running total, week overview, trend charts with notes, symptom scores (mood, pain, ADHD, custom), good/bad effects, color-coded trends. Easy add/edit/delete. Data stays on device, easy backup.

## Facts (verified)
- THCA→THC and CBDA→CBD share the same masses (358.5 → 314.5 g/mol) → one decarb factor 0.877.
- Bioavailability ranges reused from sibling project Halflives (`docs/presets.md` there).
- PubChem CIDs (16078 THC, 98523 THCA) written from memory; pubchem.ncbi.nlm.nih.gov was blocked in the build sandbox → re-check once.
- localStorage ≈ 5 MB; an entry ≈ 400 B → ~12k entries. Enough for years at 10/day.
- Sandbox Chromium needs `locale: "en-US"` (as in Halflives).

## Decisions
| # | Decision | Why |
|---|---|---|
| D1 | Vanilla JS PWA + vendored uPlot, no build | same as Halflives: tiny, self-contained, offline |
| D2 | localStorage, not IndexedDB | sync API, ~10 lines, capacity enough (see Facts) |
| D3 | Entry stores a copy of its strain | editing/deleting a strain never rewrites history |
| D4 | 3 calc modes (raw / decarb / absorbed), user toggle | user asked for all three; each labeled with evidence |
| D5 | Charts use decarb mg when mode = absorbed | 2–56% range drawn as one bar would look precise |
| D6 | No network at runtime; backup = JSON/CSV file via share sheet | data must not leave the phone |
| D7 | Import merges by id (backup wins), settings kept | restore + combine devices with one code path |
| D8 | Service worker network-first | updates appear at once; cache only for offline |
| D9 | Scores 0–10 as tap buttons, tap again clears | fast one-handed input, "not rated" ≠ 0 |
| D10 | Pages deploys from branch, CI only lints/tests | Actions deploy was blocked by environment rule; branch deploy needs no workflow |
| D11 | Work on feature branch, fast-forward `main` after each green change | user choice; `main` is what Pages serves |
| D12 | Theme auto/light/dark in settings; dark tokens duplicated (media + manual), test keeps them equal | pure CSS cannot share one block between a media query and a selector |
| D13 | Creep = EMA trend (α 0.1, Hacker's Diet/Libra) + 28-day regression rate + mean/median + use-free days | robust to single heavy days; libra-app.eu unreachable from sandbox, method from its origin |
| D14 | Use-free days count as 0 mg in consumption math | a day off is real data; skipping it would hide reductions |
| D15 | Arrows show direction, color shows good/bad | one rule for scores and usage |
| D16 | Mobile sizing: 18px base, 48px tap targets, score grid 6×2 | Pixel 7 feedback: too small |
| D17 | Calculator: tap 1–2 products, type THC mg + CBD mg, exact 2×2 solve, rounded to measurable steps, shows real totals | user: ratio input was confusing; mg is what people think in |
| D18 | Cravings as entries without dose (`noDose`) | a resisted craving has no dose but matters most |
| D19 | New optional fields (`watch`, `noDose`, `watchTags`) without version bump | older data stays valid as-is; same rule as theme/ceiling |
| D20 | One-time settings upgrade (`symptomsVersion`) adds new default symptoms (anxiety) | existing users get it; deleting it sticks |
| D21 | Import into an empty app = exact restore incl. settings | new phone must get custom symptoms/tags back |

## Tasks
| Task | Status | Owner |
|---|---|---|
| calc + store + tests | done | claude |
| UI: day / week / trends / settings, dialogs | done | claude |
| PWA (sw, manifest), CI, docs | done | claude |
| Merge to `main` | done | claude |
| Enable Pages | done (deploy from branch) | user |
| Re-verify PubChem CIDs | open | — |
| PNG icons for older iOS home screen | idea (YAGNI until needed) | — |
| Optional encrypted backup (WebCrypto) | idea | — |

## Open questions
- Sublingual oil: treated as oral (no sourced F for sublingual).

## Log
- 2026-10-18 claude: fixed JSON export (blob URL revoked too early), calculator rebuilt (THC+CBD mg, chips, no crash on CBD-only), anxiety score, exact restore into empty app. 28 tests.
- 2026-10-18 claude: dose calculator (1–2 products, ratio mixing), watch tags + no-dose entries on day/week/trends, reasons for 10%/5%. 26 tests.
- 2026-10-18 claude: Pixel 7 sizing, usage-creep card + trend line + weekly rate, mean/median, use-free days, personal ceiling. 22 tests.
- 2026-10-18 claude: theme switch (auto/light/dark), release flow to `main` in CLAUDE.md.
- 2026-10-18 claude: Pages switched to branch deploy → removed deploy job, added `.nojekyll`.
- 2026-10-18 claude: Pages URL in README, pushed to `main`.
- 2026-10-18 claude: v1 — calc/store/app, 15 tests, Playwright e2e at 390×844 (add, edit, delete+undo, week, trends, export → wipe → import roundtrip equal, offline reload).

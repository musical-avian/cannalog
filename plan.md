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
- Libra (fetched via a one-off GH Actions run, 2026-10-21; https://libra-app.eu/support/trend/, /support/forecast/): trend `power = 1 − e^(−Δt/τ)`, τ = 7 days default (= α 0.133 for daily data; ours 0.1 = τ 9.5 d); rate = linear regression over **trend** values in a 7-day window; no "stable" threshold documented. Time-aware Δt is a no-op for us (daily series, Δt always 1).
- Eval (simulated 90 days, 10 mg ± 3): false "up/down" alarms on flat use — ours (raw, 28 d) 31%, Libra (trend, 7 d) 62%, trend over 28 d 6%. One 40 mg day yesterday → rate 1.4 / 4.6 / 0.3. Trend-28 d lags a sudden step (1.0 vs 2.8 after 7 days). Window sweep (no days off): +50% dose shows in 4–5 days with any method; small creep is limited by day-to-day noise, not window length.

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
| D13 | Creep = EMA trend (α 0.1, Hacker's Diet/Libra) + 28-day regression rate + mean/median + use-free days | robust to single heavy days; Libra formulas checked 2026-10-21 (see Facts) |
| D14 | Use-free days count as 0 mg in consumption math | a day off is real data; skipping it would hide reductions |
| D15 | Arrows show direction, color shows good/bad | one rule for scores and usage |
| D16 | Mobile sizing: 16px base, 44px tap targets, score grid 6×2 | first "too small" report was desktop mode; 18px/48px then felt too big |
| D17 | Calculator: tap 1–2 products, type THC mg + CBD mg, exact 2×2 solve, rounded to measurable steps, shows real totals | user: ratio input was confusing; mg is what people think in |
| D18 | Cravings as entries without dose (`noDose`) | a resisted craving has no dose but matters most |
| D19 | New optional fields (`watch`, `noDose`, `watchTags`) without version bump | older data stays valid as-is; same rule as theme/ceiling |
| D20 | One-time settings upgrade (`symptomsVersion`) adds new default symptoms (anxiety) | existing users get it; deleting it sticks |
| D21 | Import into an empty app = exact restore incl. settings | new phone must get custom symptoms/tags back |
| D22 | Backup = save file + share (text/plain) + copy/paste; app version in Settings; SW fetch with `no-cache` | JSON export failed silently on Android; old cached code ran for minutes; no way to tell versions apart |
| D23 | License AGPL-3.0-only (SPDX headers, source link in Settings) | hosted web app: modified hosted copies must share source (§13) |
| D24 | App icon: notebook + leaf (`icon.svg`), PNGs 192/512/maskable/apple made by `make icons` (Playwright) | Android needs PNGs to install; generated so they stay in sync with the SVG |
| D25 | Vaporizer load + sips, mg split evenly (`expandLoads`); full load always counts, Empty = 1 tap | one fill used all day; "how much was used" is unknowable for flower, consistent upper bound beats a guess |
| D26 | Context tags (beneficial/neutral) with optional value on any entry | meds/habits next to use, no separate med schedule (YAGNI) |
| D27 | Correlations: same-day + next-day Pearson r (≥ 10 days), use-free vs use days, tag with/without (≥ 3 days); Cohen words | readable for patient and doctor; minimums avoid noise |
| D29 | Creep signal = median of last 7 days vs 28 days before, ±10% (`levelChange`); 28-day slope kept as muted info; days before first entry never count as 0 mg | user wants to notice a new dose within ~a week, before getting used to it; slope flagged one heavy day as "rising" 99% of the time; simulation in docs/limits.md |
| D30 | Dose entries keep before (`scores`) and after (`after: { t, scores }`) ratings; in-app banner 30 min–6 h asks for after; Skip = empty after | editing used to overwrite "before", losing how much a dose helped; optional field per D19, no migration |
| D28 | Doctor report via print view (no PDF library), German, 1 A4 page, b/w SVG; verified 1 page with Playwright page.pdf | no dependency, vector, prints on any printer |

## Tasks
| Task | Status | Owner |
|---|---|---|
| calc + store + tests | done | claude |
| UI: day / week / trends / settings, dialogs | done | claude |
| PWA (sw, manifest), CI, docs | done | claude |
| Merge to `main` | done | claude |
| Enable Pages | done (deploy from branch) | user |
| Re-verify PubChem CIDs | open | — |
| Optional encrypted backup (WebCrypto) | idea | — |
| AVB tracking (kept amount, stash, user-entered strength) | idea — no sourced potency for AVB | — |
| Confirm backup buttons on a real Android phone | done: download works, share blocked by browser (leave as is) | user |
| Eval Libra trend/rate vs calc.js | done (Facts); led to D29 | claude |
| Retcon LICENSE into all commits (filter-branch + force push) | done | claude |

## Open questions
- Sublingual oil: treated as oral (no sourced F for sublingual).

## Log
- 2026-10-23 claude: D30 before/after ratings on doses, "How do you feel now?" banner, Trends card "Change after a dose", report column, CSV after columns; no-dose labeled as check-in. 42 tests, report 1 page (stress).
- 2026-10-21 claude: D29 level check (median 7 d vs 28 d, ±10%) drives creep arrow in app + report; slope muted info; slope/level skip days before first entry. 40 tests, report 1 page (normal, 3-day, stress).
- 2026-10-21 claude: Libra formulas fetched via temporary GH workflow (removed), compared by simulation. No code change yet.
- 2026-10-21 claude: report: visual summary block at top (sparkline, |r| bars, strongest factors), side-by-side factor/amount tables, 1 page verified on worst case. 38 tests.
- 2026-10-21 claude: use-free mean only from ≥ 3 days; r of logged amounts (sleep h, medication mg) with THC + symptoms, also for daily tags. 37 tests.
- 2026-10-21 claude: correlations never silently hidden: "no variation" label instead of "too few"; every-day/rare tags named in report + app. 36 tests.
- 2026-10-21 claude: context tags, correlations (Trends card), German A4 doctor report (print → PDF, 1 page verified). 35 tests.
- 2026-10-20 claude: dropped ¾/½/¼ guess on Empty (flower: unknowable); full load counts, old fractions kept.
- 2026-10-20 claude: vaporizer load + sips (split mg, used fraction on empty, banner with Sip now). 30 tests.
- 2026-10-19 claude: PWA icon (notebook + leaf, user-picked v2c), PNG set via `make icons`. LICENSE retconned into all commits (force-pushed, user-approved).
- 2026-10-19 claude: AGPL-3.0 (LICENSE, SPDX, source link in Settings), UI back to medium size. Retcon blocked by auto-mode classifier.
- 2026-10-18 claude: JSON export still dead on Android Chrome → 3 backup paths with feedback (save/share/copy) + paste restore, visible app version, SW revalidates (fixes stale app.js). Can't test on a real phone here.
- 2026-10-18 claude: fixed JSON export (blob URL revoked too early), calculator rebuilt (THC+CBD mg, chips, no crash on CBD-only), anxiety score, exact restore into empty app. 28 tests.
- 2026-10-18 claude: dose calculator (1–2 products, ratio mixing), watch tags + no-dose entries on day/week/trends, reasons for 10%/5%. 26 tests.
- 2026-10-18 claude: Pixel 7 sizing, usage-creep card + trend line + weekly rate, mean/median, use-free days, personal ceiling. 22 tests.
- 2026-10-18 claude: theme switch (auto/light/dark), release flow to `main` in CLAUDE.md.
- 2026-10-18 claude: Pages switched to branch deploy → removed deploy job, added `.nojekyll`.
- 2026-10-18 claude: Pages URL in README, pushed to `main`.
- 2026-10-18 claude: v1 — calc/store/app, 15 tests, Playwright e2e at 390×844 (add, edit, delete+undo, week, trends, export → wipe → import roundtrip equal, offline reload).

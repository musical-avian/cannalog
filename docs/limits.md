# Limits

Personal log. Not medical or dosing advice.

## Evidence per value
| Value | Level | Note |
|---|---|---|
| Label THC/CBD | user data | labels vary ±; batch tests differ |
| Decarb 0.877 | **derived** (molar masses) | maximum; real heating converts less, vaporizers leave THCA, combustion destroys some |
| THC inhaled F 2–56% | measured range | huge spread: device, puff depth, experience |
| THC oral F 4–12% | measured range | food, first pass |
| CBD inhaled F 18–44% | measured (smoked, n=5) | vaping assumed similar |
| CBD oral F 6% | **assumed** | no human absolute value |
| Oil sublingual | **assumed = oral** | no sourced sublingual F |

## Chosen, not measured
| Value | Why |
|---|---|
| Trend smoothing α = 0.1 | Hacker's Diet default. Memory ≈ 1/α = 10 days, half-life ≈ 6.6 days (ln ½ / ln 0.9). One heavy day moves the trend only 10% of its excess; a real, lasting change shows ~65% within 10 days. Evens out weekday/weekend swings without hiding a 2-week change. |
| Trend smoothing vs Libra | Libra: τ 7 days, time-aware (`1 − e^(−Δt/τ)`) ≈ α 0.133 for daily values. Our series has one value per day, so time-awareness changes nothing; 0.1 vs 0.133 only changes how fast the chart line follows. |
| Rate window 28 days (info only, D29) | judgement call: long enough to ignore one odd week. Too slow and too jumpy as the main signal: one heavy day flags "rising" ~99% of the time (simulation below). Libra's 7-day regression over the trend was worse (62% false alarms on flat use). |
| Level check: median last 7 days vs 28 before, ±10% (main signal) | chosen from a simulation (10 mg/day, no days off, 300 runs; day-to-day noise ±15% / ±30%): flags flat use 10% / 27%, a single 30 mg day 26% / 42%; notices +20% after 6 / 8 days, +50% after 5 / 4 days. 15% would cut false alarms but miss +20% for weeks. Noisier days = later detection; no window beats that. Needs ≥ 7 days of baseline; days before the first entry are not counted. |
| "Stable" = change ≤ 5% of mean (slope, week means) | Below what the input can resolve: labels are often off by >10% ([Vandrey 2015](https://doi.org/10.1001/jama.2015.6613): 17% of edibles within ±10%), a kitchen scale ±10 mg on 100 mg = ±10%. Still small enough that +5%/week creep shows within ~4 weeks (≈ +20%). |
| Personal ceiling | the user's own number, not a recommendation |
| Calculator amount steps (1 mg, 0.05 ml, ¼ unit) | what can realistically be measured (scale, ~1 drop, cut edible) |
| "urge resisted" = the one watch tag where more is good | design choice |
| r only from 10 paired days | below that, one odd day swings r a lot; chosen, not a statistical rule |
| Tag comparison only with ≥ 3 days with and without | same reason; chosen. Only gates the factor table, never THC ↔ symptom r; skipped tags are named (every day / only n×) |
| Vaporizer load counts fully | how much a dry-herb vape really extracts is unknown (temperature, draws); a consistent upper bound keeps trends comparable |

## Not modeled
- Blood levels over time (see sibling project Halflives).
- Tolerance, minor cannabinoids, terpenes.
- Scores are self-rated; trends and correlations are not cause. Many comparisons at once → some "strong" values happen by chance; treat as hints for the doctor talk.

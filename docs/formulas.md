# Formulas

All in `calc.js`. Numbers: `docs/sources.md`.

## 1. mg in product (`productMg`)
| Form | Amount | Strength | THC mg |
|---|---|---|---|
| flower | mg | % w/w | amount × % / 100 |
| oil | ml | mg/ml | amount × mg/ml |
| edible | units | mg/unit | amount × mg/unit |

CBD the same way.

## 2. Active mg (`activeMg`), 3 modes
- **raw** = product mg.
- **decarb** = product mg × 0.877, only if the strain is marked "label lists THCA/CBDA". Otherwise = raw.
- **absorbed** = decarb mg × [F low, F high] by route → shown as a range.

Charts use decarb when mode = absorbed (D5 in plan.md). Week table uses the upper end.

## 3. Ratio
`THC:CBD` as `x:1` if THC ≥ CBD, else `1:x`. Charts plot **THC share** = THC / (THC + CBD) × 100 (bounded, plots cleanly).

## 4. Day / week
- Day = local calendar day of the entry time. Week starts Monday.
- Running total = sum of entries of that day up to and including each entry.
- Scores: mean of all ratings that day/week (unrated ≠ 0, skipped).

## 5. Trends
- Symptom chart: 7-day rolling mean of daily means, gaps skipped (no fake zeros).
- Week arrows: change vs previous week. Scores: |Δ| < 0.5 → "=". Effects: |Δ count| < 1 → "=".
- Direction: per symptom `higherIsBetter` (mood yes; pain, ADHD no). Good effects: more = better; bad effects: more = worse.
- Cell color: goodness 0–1 → hue 0 (red) … 120 (green).

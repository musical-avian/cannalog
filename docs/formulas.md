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

## 6. Usage creep (is daily THC going up?)
Goal: stay as low as possible. All on THC mg/day in chart mode (decarb when mode = absorbed).
- **Days without use = 0 mg** (real data), unlike symptom scores (missing = gap).
- **Smoothed trend** (chart line): `trend = previous + 0.1 × (today − previous)`, started at the first logged day so it is warmed up before the visible range. Hacker's Diet method (same idea as Libra).
- **Weekly rate**: least-squares slope of the last 28 days × 7 → "mg/day per week". |rate| ≤ 5% of the 28-day mean → "stable"; up = red, down = green.
- **Mean and median** mg/day per week (median ignores a single heavy day); compared to previous week with the same 5% rule (min 0.1 mg).
- **Use-free days** per week; more = green.
- **Arrows**: ▲/▼ = real direction, color = good/bad (pain ▼ green, THC ▲ red).
- **Personal ceiling** (optional, user-set): dashed line on chart, bar on Day view.

## 7. Dose calculator
- mg per unit: flower `% / 100` per mg, oil mg/ml, edible mg/unit; × 0.877 if acid label (raw mode: no factor; absorbed treated as decarb, D5).
- One product: `amount = THC mg / THC per unit`.
- Two products, target THC `T` and ratio `r : 1`: solve `a·thcA + b·thcB = T`, `a·cbdA + b·cbdB = T / r`. Negative `a` or `b` → ratio not reachable; every mix lies between the two products' own ratios. Same ratio → mixing can't change it.
- Amounts rounded to steps (1 mg, 0.05 ml, ¼ unit); the result shows what the **rounded** amounts really contain.

## 8. Watch tags (cravings etc.)
- Logged with a dose or without (`noDose` entry). No-dose entries add 0 mg, are not "uses", and don't break use-free days.
- Counts per day/week; more = red, except "urge resisted" (more = green).
- Trends: orange dot at the top of the mg chart on days with watch tags; notes panel lists them.

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

## 7. Dose calculator (`planForMg`)
Input: 1–2 products (tap chips), target THC mg and CBD mg.
- mg per unit: flower `% / 100` per mg, oil mg/ml, edible mg/unit; × 0.877 if acid label (raw mode: no factor; absorbed treated as decarb, D5).
- **1 product**: `amount = THC mg / THC per unit` (or CBD if no THC entered). The other compound is whatever the product has.
- **2 products**: solve `a·thcA + b·thcB = THC`, `a·cbdA + b·cbdB = CBD`. Negative `a` or `b` → not possible; every mix's THC:CBD lies between the two products' own ratios (shown). Same ratio → mixing can't change it.
- Errors are messages, never crashes. Amounts rounded to steps (1 mg, 0.05 ml, ¼ unit); result shows what the **rounded** amounts contain.
- Example: 10/10 oil + 20 mg/ml CBD oil, 5 mg THC + 10 mg CBD → 0.5 ml + 0.25 ml.

## 8. Watch tags (cravings etc.)
- Logged with a dose or without (`noDose` entry). No-dose entries add 0 mg, are not "uses", and don't break use-free days.
- Counts per day/week; more = red, except "urge resisted" (more = green).
- Trends: orange dot at the top of the mg chart on days with watch tags; notes panel lists them.

## 9. Vaporizer load (fill once, use through the day)
- Load = dose entry with `load`. Each "Sip now" = one more use of it. The fill counts as the first use.
- `share = amount × used / (1 + sips)`; every use gets that share at its own time (`expandLoads`). So a sip after midnight counts on the next day.
- The full load always counts (`used` = 1); the share shrinks with each sip, the day total stays the full load.
- "Empty" just closes the load. No "how much was used" guess: for flower in a dry-herb vape that is unknowable, and a consistent upper bound keeps trends honest. Loads logged by an earlier version with ¾/½/¼ keep that value.
- All math (day, week, trends, creep, CSV) runs on the expanded list; the saved data keeps the raw load + sips.

## 10. Correlations (Trends card, report)
- Per day: THC mg (0 on use-free days), symptom = daily mean (missing if unrated), tags = logged that day yes/no (`dailySeries`).
- **r** = Pearson correlation of daily THC with the same day's score; **next day** = THC today vs score tomorrow. Shown only with ≥ 10 paired days.
- Words: |r| < 0.1 none, < 0.3 weak, < 0.5 moderate, else strong (Cohen 1988). Direction uses `higherIsBetter` ("more THC, less pain").
- **Use-free vs use days**: mean score on days with 0 mg vs days with use.
- **Factors** (context + watch tags): days with vs without the tag → mean THC, and the symptom with the biggest difference. Only with ≥ 3 days on both sides.
- What the minimums apply to: **r** needs ≥ 10 days with both THC and the score (use-free days count as 0 mg, so daily users still get r). The **3-day rule** only gates the factor table. Nothing else is hidden:
  - no r because THC (or the score) was the same every day → "THC always the same" / „THC immer gleich“, not "too few days";
  - tags logged (almost) every day or only 1–2 times → listed as "not comparable (every day / only n×)".
- Correlation ≠ cause; many comparisons → read single values as hints.

## 11. Doctor report (`report.js`)
- German, one A4 page, black/white (print → "Save as PDF").
- 4 weeks daily: grey THC bars + black symptom lines (dash + marker per symptom, 0–10) + one strip per tag (■ = logged that day), all on the same columns.
- 6 months weekly: mean THC/day bars + weekly symptom means.
- Tables: THC ↔ symptoms (use-free vs use days, r 4 W / 6 M, next day, verdict) and factors.
- Symptoms never rated in 6 months are left out.

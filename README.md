# Cannalog

**Live:** https://musical-avian.github.io/cannalog/

Private medical cannabis log. Runs in the browser, installable, offline. Data stays on your phone.

- Strains/products: flower (%), oil (mg/ml), edible (mg/unit).
- Log uses: amount, time, route, mood/pain/ADHD/anxiety/custom scores 0–10, good/bad effects, note.
- Day: running total THC/CBD + ratio. Week: table, color-coded vs last week. Trends: charts + notes.
- mg as: in product / decarboxylated / absorbed estimate.
- Usage creep: smoothed trend, weekly rate, mean/median, use-free days, optional personal ceiling.
- Watch tags (craving, urge resisted, used to cope, …), loggable without a dose, shown on the timeline.
- Vaporizer load: fill once, tap "Sip now" through the day; mg split over the uses; on empty: all/¾/½/¼ used.
- Dose calculator: want x mg THC (+ y mg CBD) → how much of 1–2 products.
- Backup: JSON export/import, CSV export.

Not medical or dosing advice. Docs: [`docs/`](docs). Dev: `make test`, `make lint`, `make serve`.

Install on phone: open the Pages URL → browser menu → "Add to Home Screen".

## License
[AGPL-3.0-only](LICENSE). Copyright (C) 2026 the Cannalog authors. Free software: use, study, change, share; if you host a modified version, offer its source to its users.
Vendored uPlot keeps its MIT license (`vendor/uPlot.LICENSE`).

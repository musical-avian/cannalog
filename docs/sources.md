# Sources

Every number in `calc.js` comes from here. Test `test/calc.test.js` fails if a URL is missing.

| Value | Number | Evidence | Source |
|---|---|---|---|
| Decarb factor THCA→THC, CBDA→CBD | 314.5 / 358.5 = 0.877 | derived (molar masses) | [PubChem THC](https://pubchem.ncbi.nlm.nih.gov/compound/16078), [PubChem THCA](https://pubchem.ncbi.nlm.nih.gov/compound/98523) |
| THC inhaled bioavailability | 2–56% | measured range | [Huestis 2007](https://doi.org/10.1002/cbdv.200790152) |
| THC oral bioavailability | 4–12% | measured range | [Huestis 2007](https://doi.org/10.1002/cbdv.200790152) |
| CBD inhaled bioavailability | 31 ± 13% → 18–44% | measured (smoked, n=5) | [Ohlsson 1986](https://doi.org/10.1002/bms.1200130206) |
| CBD oral bioavailability | 6% | **assumed** (no human absolute value) | [Millar 2018](https://doi.org/10.3389/fphar.2018.01365) |
| Trend smoothing α | 0.1 (trend moves 10% toward each day) | method choice | [Walker, The Hacker's Diet](https://www.fourmilab.ch/hackdiet/) |
| Libra comparison (not used as numbers, checked against) | τ 7 days (≈ α 0.133/day); rate = regression over trend, 7-day window | method description | [Libra: What is a trend?](https://libra-app.eu/support/trend/), [Libra: forecasts](https://libra-app.eu/support/forecast/) |
| Level check: 7 vs 28 days, 10% | median of last 7 days vs 28 before | **assumed**, simulated trade-off (`docs/limits.md`) | own simulation, see `docs/limits.md` |
| Label accuracy (context for 5% "stable") | 17% of edibles labeled within ±10% | measured (n=75 products) | [Vandrey 2015](https://doi.org/10.1001/jama.2015.6613) |
| Correlation strength words | \|r\| 0.1 weak, 0.3 moderate, 0.5 strong | convention | [Cohen 1988](https://doi.org/10.4324/9780203771587) |

Same sources as the sibling project Halflives (`docs/presets.md` there).

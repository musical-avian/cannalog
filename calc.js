// SPDX-License-Identifier: AGPL-3.0-only
// Pure math: how much THC/CBD an entry contains, day/week totals, trends. No DOM, no storage.
// Every number here has a source in docs/sources.md (test enforces it).

export const SOURCES = {
  pubchemThc: { title: "PubChem: THC (314.5 g/mol)", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16078" },
  pubchemThca: { title: "PubChem: THCA (358.5 g/mol)", url: "https://pubchem.ncbi.nlm.nih.gov/compound/98523" },
  huestis2007: { title: "Huestis 2007, Human cannabinoid pharmacokinetics", url: "https://doi.org/10.1002/cbdv.200790152" },
  ohlsson1986: { title: "Ohlsson 1986, CBD after smoking and IV", url: "https://doi.org/10.1002/bms.1200130206" },
  millar2018: { title: "Millar 2018, systematic review of CBD PK", url: "https://doi.org/10.3389/fphar.2018.01365" },
  hackersDiet: { title: "Walker, The Hacker's Diet: exponentially smoothed trend", url: "https://www.fourmilab.ch/hackdiet/" },
  cohen1988: {
    title: "Cohen 1988, Statistical Power Analysis (r: 0.1 small, 0.3 medium, 0.5 large)",
    url: "https://doi.org/10.4324/9780203771587",
  },
};

// THCA → THC loses CO2. Mass factor = 314.5 / 358.5. CBDA → CBD has the same masses.
// Evidence: derived (molar masses). Real heating converts less than 100% (docs/limits.md).
export const DECARB_FACTOR = 314.5 / 358.5;

// Fraction of the dose that reaches blood, as [low, high].
// Evidence: measured ranges, except CBD oral (assumed, no human absolute value exists).
export const BIOAVAILABILITY = {
  thc: {
    inhaled: [0.02, 0.56], // Huestis 2007: smoked 2–56%
    oral: [0.04, 0.12], // Huestis 2007: oral 4–12%
  },
  cbd: {
    inhaled: [0.18, 0.44], // Ohlsson 1986: smoked 31 ± 13%
    oral: [0.06, 0.06], // assumed 6%, see Millar 2018 and docs/limits.md
  },
};

export const CALC_MODES = {
  raw: "in product",
  decarb: "decarboxylated",
  absorbed: "absorbed (estimate)",
};

/**
 * mg of THC and CBD in the amount taken, straight from the label.
 * flower: amount in mg × percent. oil: amount in ml × mg/ml. edible: amount in units × mg/unit.
 */
export function productMg(entry) {
  if (!isDose(entry)) return { thc: 0, cbd: 0 }; // craving / event entry: nothing taken
  if (!entry.strain) throw new Error(`entry ${entry.id} has no product. Sips need expandLoads() before any math.`);
  const strain = entry.strain;
  if (strain.form === "flower") {
    return { thc: (entry.amount * strain.thc) / 100, cbd: (entry.amount * strain.cbd) / 100 };
  }
  // oil and edible: label already gives mg per ml / per unit
  return { thc: entry.amount * strain.thc, cbd: entry.amount * strain.cbd };
}

/**
 * Active compound as a range { thc: [low, high], cbd: [low, high] } in mg.
 * raw and decarb give low === high; absorbed gives a real range.
 */
export function activeMg(entry, mode) {
  if (!isDose(entry)) return { thc: [0, 0], cbd: [0, 0] };
  const product = productMg(entry);
  if (mode === "raw") {
    return { thc: [product.thc, product.thc], cbd: [product.cbd, product.cbd] };
  }

  // Only labels that list the acid form (THCA/CBDA) lose mass on heating.
  const factor = entry.strain.acid ? DECARB_FACTOR : 1;
  const thc = product.thc * factor;
  const cbd = product.cbd * factor;
  if (mode === "decarb") {
    return { thc: [thc, thc], cbd: [cbd, cbd] };
  }

  if (mode === "absorbed") {
    const thcF = BIOAVAILABILITY.thc[entry.route];
    const cbdF = BIOAVAILABILITY.cbd[entry.route];
    return {
      thc: [thc * thcF[0], thc * thcF[1]],
      cbd: [cbd * cbdF[0], cbd * cbdF[1]],
    };
  }

  throw new Error(`Unknown calc mode "${mode}". Use one of: ${Object.keys(CALC_MODES).join(", ")}`);
}

/** false for entries logged without a dose (craving, event). Older entries have no flag = dose. */
export function isDose(entry) {
  return entry.noDose !== true;
}

/** "2:1", "1:3", "THC only", "CBD only" or "–". */
export function ratioText(thcMg, cbdMg) {
  if (thcMg <= 0 && cbdMg <= 0) return "–";
  if (cbdMg <= 0) return "THC only";
  if (thcMg <= 0) return "CBD only";
  if (thcMg >= cbdMg) return `${round1(thcMg / cbdMg)}:1`;
  return `1:${round1(cbdMg / thcMg)}`;
}

/** THC as percent of THC + CBD. Bounded 0–100, so it plots better than a ratio. null if nothing taken. */
export function thcShare(thcMg, cbdMg) {
  const total = thcMg + cbdMg;
  if (total <= 0) return null;
  return (100 * thcMg) / total;
}

export function round1(x) {
  return Math.round(x * 10) / 10;
}

/** "1–3" for a range, "2" if both ends are equal after rounding. */
export function rangeText([low, high]) {
  const a = round1(low);
  const b = round1(high);
  if (a === b) return `${a}`;
  return `${a}–${b}`;
}

// ---------- dates (local time, because "today" means the user's day) ----------

/** "2026-10-18" in local time. */
export function dayKey(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Local midnight for a day key. */
export function dayStart(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key, n) {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Monday of the week containing `key`. */
export function weekStart(key) {
  const weekday = dayStart(key).getDay(); // 0 = Sunday
  const daysSinceMonday = (weekday + 6) % 7;
  return addDays(key, -daysSinceMonday);
}

/** Inclusive list of day keys from `firstKey` to `lastKey`. */
export function dayRange(firstKey, lastKey) {
  const keys = [];
  for (let key = firstKey; key <= lastKey; key = addDays(key, 1)) keys.push(key);
  return keys;
}

// ---------- totals ----------

/**
 * Summary of a list of entries (one day, one week, ...).
 * { count, thc: [low, high], cbd: [low, high], scores: { name: average }, effects: { tag: { count, good } } }
 */
export function summarize(entries, mode) {
  // count = number of doses (events without a dose are not "uses"). watch = { tag: count }.
  // context = { tag: { count, total } }: medication, exercise, sleep... total sums the optional values.
  const summary = { count: 0, thc: [0, 0], cbd: [0, 0], scores: {}, effects: {}, watch: {}, context: {} };
  const scoreSums = {};
  const scoreCounts = {};

  for (const entry of entries) {
    if (isDose(entry)) summary.count += 1;
    for (const tag of entry.watch ?? []) summary.watch[tag] = (summary.watch[tag] ?? 0) + 1;
    for (const item of entry.context ?? []) {
      const seen = summary.context[item.tag] ?? { count: 0, total: 0 };
      seen.count += 1;
      seen.total += item.value ?? 0;
      summary.context[item.tag] = seen;
    }
    const active = activeMg(entry, mode);
    summary.thc[0] += active.thc[0];
    summary.thc[1] += active.thc[1];
    summary.cbd[0] += active.cbd[0];
    summary.cbd[1] += active.cbd[1];

    for (const [name, value] of Object.entries(entry.scores)) {
      scoreSums[name] = (scoreSums[name] ?? 0) + value;
      scoreCounts[name] = (scoreCounts[name] ?? 0) + 1;
    }

    for (const effect of entry.effects) {
      const seen = summary.effects[effect.tag] ?? { count: 0, good: effect.good };
      seen.count += 1;
      summary.effects[effect.tag] = seen;
    }
  }

  for (const name of Object.keys(scoreSums)) {
    summary.scores[name] = scoreSums[name] / scoreCounts[name];
  }
  return summary;
}

/** Entries grouped by local day key, each list sorted by time. */
export function groupByDay(entries) {
  const byDay = {};
  for (const entry of entries) {
    const key = dayKey(entry.t);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(entry);
  }
  for (const list of Object.values(byDay)) list.sort((a, b) => a.t.localeCompare(b.t));
  return byDay;
}

/** Entries whose day is within [firstKey, lastKey]. */
export function entriesBetween(entries, firstKey, lastKey) {
  return entries.filter((entry) => {
    const key = dayKey(entry.t);
    return key >= firstKey && key <= lastKey;
  });
}

// ---------- trends ----------

/**
 * Average of the last `window` values at each index, skipping nulls.
 * null where the window holds no values at all (so charts show a gap, not a fake 0).
 */
export function rollingAverage(values, window) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    const inWindow = values.slice(Math.max(0, i - window + 1), i + 1).filter((v) => v != null);
    if (inWindow.length === 0) {
      result.push(null);
      continue;
    }
    const sum = inWindow.reduce((a, b) => a + b, 0);
    result.push(sum / inWindow.length);
  }
  return result;
}

// A change smaller than this (on the 0–10 scale) counts as "same", so noise is not colored.
export const SCORE_CHANGE_THRESHOLD = 0.5;

/**
 * Compare a score now vs before: "better" | "worse" | "same" | "none".
 * higherIsBetter: true for mood, false for pain/side effects.
 */
export function trend(now, before, higherIsBetter, threshold = SCORE_CHANGE_THRESHOLD) {
  if (now == null || before == null) return "none";
  const change = now - before;
  if (Math.abs(change) < threshold) return "same";
  const wentUp = change > 0;
  if (wentUp === higherIsBetter) return "better";
  return "worse";
}

/** 0 = worst, 1 = best, for coloring a 0–10 score. */
export function goodness(score, higherIsBetter) {
  if (higherIsBetter) return score / 10;
  return 1 - score / 10;
}

// ---------- usage creep: is daily THC slowly going up? ----------

// Trend smoothing: each day moves the trend 10% toward that day's value (Hacker's Diet, same idea as Libra).
// Evidence: method choice, not a clinical number (docs/limits.md).
export const TREND_SMOOTHING = 0.1;
// Days used for the weekly rate. 4 weeks: long enough to ignore one odd week.
export const RATE_WINDOW_DAYS = 28;
// A weekly change under 5% of the average counts as "stable" (assumed, docs/limits.md).
export const STABLE_RATE_FRACTION = 0.05;

/**
 * THC mg per day for each key. Days without use are 0, not a gap:
 * for consumption, a day off is real data (unlike symptom scores).
 * Upper end of the range (equal to lower end except in absorbed mode).
 */
export function dailyThcSeries(keys, byDay, mode) {
  return keys.map((key) => {
    const entries = byDay[key] ?? [];
    return summarize(entries, mode).thc[1];
  });
}

/** Exponentially smoothed trend. Starts at the first value. */
export function smoothTrend(values, alpha = TREND_SMOOTHING) {
  const result = [];
  let trendValue = null;
  for (const value of values) {
    if (trendValue === null) trendValue = value;
    else trendValue = trendValue + alpha * (value - trendValue);
    result.push(trendValue);
  }
  return result;
}

/** Least-squares slope of values over their index (change per day). 0 if fewer than 2 values. */
export function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let x = 0; x < n; x++) {
    numerator += (x - meanX) * (values[x] - meanY);
    denominator += (x - meanX) ** 2;
  }
  return numerator / denominator;
}

/**
 * How fast daily THC changes, from the last RATE_WINDOW_DAYS days.
 * { perWeek: mg/day change per week, direction: "better" | "worse" | "same" }
 * Rising use = "worse" (the goal is to stay low).
 */
export function weeklyRate(dailyValues) {
  const window = dailyValues.slice(-RATE_WINDOW_DAYS);
  const perWeek = slope(window) * 7;
  const average = mean(window);
  if (Math.abs(perWeek) <= STABLE_RATE_FRACTION * average) {
    return { perWeek, direction: "same" };
  }
  if (perWeek > 0) return { perWeek, direction: "worse" };
  return { perWeek, direction: "better" };
}

export function mean(values) {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Number of days in `keys` with no entries. */
export function useFreeDays(keys, byDay) {
  const hasDose = (key) => (byDay[key] ?? []).some(isDose);
  return keys.filter((key) => !hasDose(key)).length;
}

// Below 0.1 mg the difference is rounding noise (values are shown to 0.1 mg).
const MIN_MG_CHANGE = 0.1;

/**
 * Compare usage now vs before (e.g. mean mg/day this week vs last). Less is better.
 * Changes under STABLE_RATE_FRACTION of the earlier value count as "same".
 */
export function usageChange(now, before) {
  const smallestRealChange = Math.max(STABLE_RATE_FRACTION * before, MIN_MG_CHANGE);
  return trend(now, before, false, smallestRealChange);
}

// ---------- dose calculator ----------

/**
 * mg THC and CBD in one unit of the product (1 mg flower, 1 ml oil, 1 edible).
 * raw = label value; decarb (and absorbed, which the calculator treats as decarb, D5) applies the acid factor.
 */
export function mgPerUnit(strain, mode) {
  const perUnitOnLabel = strain.form === "flower" ? 1 / 100 : 1; // flower label is %, others are mg per unit
  let factor = 1;
  if (mode !== "raw" && strain.acid) factor = DECARB_FACTOR;
  return { thc: strain.thc * perUnitOnLabel * factor, cbd: strain.cbd * perUnitOnLabel * factor };
}

// Two products with ratios closer than this cannot be mixed to a different ratio (division by ~0).
const SAME_RATIO_TOLERANCE = 1e-9;

/**
 * Amounts of 1 or 2 products for a target THC mg and CBD mg.
 * Returns { parts: [{ strain, amount }] } or { error, possible } — never throws on user input.
 * 1 product: THC sets the amount (or CBD if no THC given); the other compound is what the product has.
 * 2 products: solves  a·thcA + b·thcB = THC  and  a·cbdA + b·cbdB = CBD.
 * possible = each product's own { thc, cbd } per unit: every mix's ratio lies between those two.
 */
export function planForMg(strains, thcMg, cbdMg, mode) {
  if (strains.length === 1) return planOneProduct(strains[0], thcMg, cbdMg, mode);
  if (strains.length !== 2) return { error: "Pick 1 or 2 products." };
  if (!(thcMg >= 0 && cbdMg >= 0) || thcMg + cbdMg <= 0) {
    return { error: "With 2 products, enter both THC mg and CBD mg (0 is fine for one of them)." };
  }
  const [strainA, strainB] = strains;
  const a = mgPerUnit(strainA, mode);
  const b = mgPerUnit(strainB, mode);
  const possible = [a, b];
  const determinant = a.thc * b.cbd - b.thc * a.cbd;
  if (Math.abs(determinant) < SAME_RATIO_TOLERANCE) {
    return { error: "Both products have the same THC:CBD ratio, so mixing them cannot change it.", possible };
  }
  const amountA = (thcMg * b.cbd - b.thc * cbdMg) / determinant;
  const amountB = (a.thc * cbdMg - thcMg * a.cbd) / determinant;
  if (amountA < 0 || amountB < 0) {
    return { error: `${ratioText(thcMg, cbdMg)} THC:CBD can't be made from these two products.`, possible };
  }
  return {
    parts: [
      { strain: strainA, amount: amountA },
      { strain: strainB, amount: amountB },
    ],
  };
}

function planOneProduct(strain, thcMg, cbdMg, mode) {
  const perUnit = mgPerUnit(strain, mode);
  if (thcMg > 0) {
    if (perUnit.thc <= 0) return { error: `"${strain.name}" has no THC. Pick a product with THC, or enter only CBD mg.` };
    return { parts: [{ strain, amount: thcMg / perUnit.thc }] };
  }
  if (cbdMg > 0) {
    if (perUnit.cbd <= 0) return { error: `"${strain.name}" has no CBD.` };
    return { parts: [{ strain, amount: cbdMg / perUnit.cbd }] };
  }
  return { error: "Enter THC mg or CBD mg." };
}

// ---------- vaporizer loads: one fill, used several times ----------

/** true for a "sip": one use of an earlier vaporizer load (has no amount of its own). */
export function isSip(entry) {
  return typeof entry.sipOf === "string";
}

/**
 * Entries ready for all math. A vaporizer load and its sips share the load's mg evenly:
 * share = amount × used / (1 + number of sips). The fill itself counts as the first use.
 * Each sip gets the load's strain/route and the share as its amount, so every other
 * function (summaries, trends, CSV) works on the result without knowing about loads.
 * Input entries are not changed.
 */
export function expandLoads(entries) {
  const sipsByLoad = {};
  for (const entry of entries) {
    if (!isSip(entry)) continue;
    if (!sipsByLoad[entry.sipOf]) sipsByLoad[entry.sipOf] = [];
    sipsByLoad[entry.sipOf].push(entry);
  }

  const result = [];
  for (const entry of entries) {
    if (isSip(entry)) continue; // added below, together with their load
    if (!entry.load) {
      result.push(entry);
      continue;
    }
    const sips = sipsByLoad[entry.id] ?? [];
    const share = (entry.amount * entry.load.used) / (1 + sips.length);
    result.push({ ...entry, amount: share });
    for (const sip of sips) {
      result.push({ ...sip, strain: entry.strain, route: entry.route, amount: share });
    }
  }
  return result;
}

// ---------- correlations: does use go together with symptoms or other factors? ----------

// Fewer paired days than this → no r shown ("too few days"). Chosen, not a statistical rule (docs/limits.md).
export const MIN_PAIRED_DAYS = 10;
// A tag comparison needs at least this many days with and without the tag (docs/limits.md).
export const MIN_GROUP_DAYS = 3;
// Cohen 1988 conventions for |r|: 0.1 small, 0.3 medium, 0.5 large.
export const R_WEAK = 0.1;
export const R_MODERATE = 0.3;
export const R_STRONG = 0.5;

/**
 * One row per day: { key, thc, cbd, scores: { name: mean or missing }, tags: { tag: count } }.
 * THC is 0 on use-free days (real data); a symptom is missing on days it was not rated.
 * tags holds both watch tags and context tags (medication, exercise, ...).
 */
export function dailySeries(keys, byDay, mode) {
  return keys.map((key) => {
    const summary = summarize(byDay[key] ?? [], mode);
    const tags = { ...summary.watch };
    for (const [tag, seen] of Object.entries(summary.context)) tags[tag] = seen.count;
    return { key, thc: summary.thc[1], cbd: summary.cbd[1], scores: summary.scores, tags };
  });
}

/**
 * Pearson correlation of two equally long lists; pairs where either value is null/undefined are skipped.
 * { r, n, reason }: r is null when there are fewer than MIN_PAIRED_DAYS pairs (reason "too few")
 * or when one side never changes (reason "no variation x" / "no variation y": with 180 days of the
 * same THC amount there is plenty of data, just nothing to correlate, so say that instead of "too few").
 */
export function pearson(xs, ys) {
  const pairs = [];
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] == null || ys[i] == null) continue;
    pairs.push([xs[i], ys[i]]);
  }
  const n = pairs.length;
  if (n < MIN_PAIRED_DAYS) return { r: null, n, reason: "too few" };
  const meanX = mean(pairs.map((p) => p[0]));
  const meanY = mean(pairs.map((p) => p[1]));
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;
  for (const [x, y] of pairs) {
    sumXY += (x - meanX) * (y - meanY);
    sumXX += (x - meanX) ** 2;
    sumYY += (y - meanY) ** 2;
  }
  if (sumXX === 0) return { r: null, n, reason: "no variation x" };
  if (sumYY === 0) return { r: null, n, reason: "no variation y" };
  return { r: sumXY / Math.sqrt(sumXX * sumYY), n, reason: null };
}

/**
 * Word for a pearson() result: "none" | "weak" | "moderate" | "strong",
 * or why there is no r: "too few" | "no variation x" | "no variation y".
 */
export function strengthLabel(result) {
  if (result.r == null) return result.reason;
  const size = Math.abs(result.r);
  if (size < R_WEAK) return "none";
  if (size < R_MODERATE) return "weak";
  if (size < R_STRONG) return "moderate";
  return "strong";
}

/**
 * Does more THC go with a better or worse symptom? "better" | "worse" | null (no clear relation).
 * Uses the symptom's direction: for pain, a negative r (more THC, less pain) is "better".
 */
export function relationDirection(r, higherIsBetter) {
  if (r == null || Math.abs(r) < R_WEAK) return null;
  const goesUp = r > 0;
  if (goesUp === higherIsBetter) return "better";
  return "worse";
}

function meanOrNull(values) {
  if (values.length === 0) return null;
  return mean(values);
}

/**
 * Per symptom: r on the same day, r with the next day's score, and mean score on use-free days vs use days.
 */
export function useCorrelations(days, symptoms) {
  const thc = days.map((d) => d.thc);
  return symptoms.map((symptom) => {
    const score = days.map((d) => d.scores[symptom.name] ?? null);
    const freeScores = days.filter((d, i) => d.thc === 0 && score[i] != null).map((d) => d.scores[symptom.name]);
    const useScores = days.filter((d, i) => d.thc > 0 && score[i] != null).map((d) => d.scores[symptom.name]);
    return {
      symptom,
      sameDay: pearson(thc, score),
      nextDay: pearson(thc.slice(0, -1), score.slice(1)), // THC today vs score tomorrow
      freeMean: meanOrNull(freeScores),
      freeN: freeScores.length,
      useMean: meanOrNull(useScores),
      useN: useScores.length,
    };
  });
}

/**
 * Per tag: days with/without it, mean THC with/without, and the symptom that differs most.
 * { rows, skipped }: a tag with fewer than MIN_GROUP_DAYS days on either side can't be compared;
 * it goes to skipped with reason "every day" (e.g. daily medication) or "rare", so the report can say so.
 * Tags never logged in the period are not listed at all.
 */
export function tagComparisons(days, tags, symptoms) {
  const rows = [];
  const skipped = [];
  for (const tag of tags) {
    const withTag = days.filter((d) => (d.tags[tag] ?? 0) > 0);
    const without = days.filter((d) => !((d.tags[tag] ?? 0) > 0));
    if (withTag.length === 0) continue;
    if (without.length < MIN_GROUP_DAYS) {
      skipped.push({ tag, daysWith: withTag.length, reason: "every day" });
      continue;
    }
    if (withTag.length < MIN_GROUP_DAYS) {
      skipped.push({ tag, daysWith: withTag.length, reason: "rare" });
      continue;
    }
    const row = {
      tag,
      daysWith: withTag.length,
      thcWith: mean(withTag.map((d) => d.thc)),
      thcWithout: mean(without.map((d) => d.thc)),
      symptom: null,
      scoreWith: null,
      scoreWithout: null,
    };
    for (const symptom of symptoms) {
      const rated = (list) => list.map((d) => d.scores[symptom.name]).filter((v) => v != null);
      const ratedWith = rated(withTag);
      const ratedWithout = rated(without);
      if (ratedWith.length < MIN_GROUP_DAYS || ratedWithout.length < MIN_GROUP_DAYS) continue;
      const scoreWith = mean(ratedWith);
      const scoreWithout = mean(ratedWithout);
      const biggestSoFar = row.symptom ? Math.abs(row.scoreWith - row.scoreWithout) : -1;
      if (Math.abs(scoreWith - scoreWithout) > biggestSoFar) Object.assign(row, { symptom, scoreWith, scoreWithout });
    }
    rows.push(row);
  }
  return { rows, skipped };
}

/** Days grouped into weeks (Monday start) for the long-term view: { weekKey, thcPerDay, scores: { name: mean } }. */
export function weeklySeries(days) {
  const weeks = [];
  for (const day of days) {
    const key = weekStart(day.key);
    let week = weeks.at(-1);
    if (!week || week.key !== key) {
      week = { key, days: [] };
      weeks.push(week);
    }
    week.days.push(day);
  }
  return weeks.map((week) => {
    const scores = {};
    const names = new Set(week.days.flatMap((d) => Object.keys(d.scores)));
    for (const name of names) {
      scores[name] = mean(week.days.map((d) => d.scores[name]).filter((v) => v != null));
    }
    return { key: week.key, thcPerDay: mean(week.days.map((d) => d.thc)), scores };
  });
}

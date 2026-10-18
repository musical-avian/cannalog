// Pure math: how much THC/CBD an entry contains, day/week totals, trends. No DOM, no storage.
// Every number here has a source in docs/sources.md (test enforces it).

export const SOURCES = {
  pubchemThc: { title: "PubChem: THC (314.5 g/mol)", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16078" },
  pubchemThca: { title: "PubChem: THCA (358.5 g/mol)", url: "https://pubchem.ncbi.nlm.nih.gov/compound/98523" },
  huestis2007: { title: "Huestis 2007, Human cannabinoid pharmacokinetics", url: "https://doi.org/10.1002/cbdv.200790152" },
  ohlsson1986: { title: "Ohlsson 1986, CBD after smoking and IV", url: "https://doi.org/10.1002/bms.1200130206" },
  millar2018: { title: "Millar 2018, systematic review of CBD PK", url: "https://doi.org/10.3389/fphar.2018.01365" },
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
  const summary = { count: entries.length, thc: [0, 0], cbd: [0, 0], scores: {}, effects: {} };
  const scoreSums = {};
  const scoreCounts = {};

  for (const entry of entries) {
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

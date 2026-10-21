// SPDX-License-Identifier: AGPL-3.0-only
// One-page A4 report for a doctor, German, black/white. Pure string building (HTML + inline SVG), no DOM.
// app.js puts the result into #report and opens the print dialog ("Save as PDF").

import {
  addDays,
  dailySeries,
  dayRange,
  dayStart,
  groupByDay,
  MIN_PAIRED_DAYS,
  mean,
  median,
  R_MODERATE,
  R_STRONG,
  R_WEAK,
  relationDirection,
  strengthLabel,
  tagComparisons,
  useCorrelations,
  useFreeDays,
  valueCorrelations,
  weeklyRate,
  weeklySeries,
} from "./calc.js";

export const SHORT_DAYS = 28;
export const LONG_WEEKS = 26;
const MAX_TAG_ROWS = 8; // tag strips in the 4-week chart; more would not fit on one page
// Row limits keep the report on one A4 page (checked with Playwright page.pdf in the e2e run).
const MAX_FACTOR_ROWS = 4;
const MAX_AMOUNT_ROWS = 3;
const DAILY_CHART_HEIGHT = 26; // mm, plot area of the 4-week chart
const WEEKLY_CHART_HEIGHT = 20; // mm, the 6-month chart: a course, not details

// Default names in German; names the user typed stay as they are.
const GERMAN = {
  mood: "Stimmung",
  pain: "Schmerz",
  ADHD: "ADHS",
  anxiety: "Angst",
  medication: "Medikament",
  exercise: "Bewegung",
  sleep: "Schlaf",
  therapy: "Therapie",
  meditation: "Meditation",
  "social time": "Soziale Kontakte",
  caffeine: "Koffein",
  alcohol: "Alkohol",
  craving: "Verlangen",
  "urge resisted": "Verlangen widerstanden",
  "used to cope": "Konsum zur Bewältigung",
  boredom: "Langeweile",
  "more than planned": "Mehr als geplant",
  "needed more": "Mehr gebraucht",
  "withdrawal: sleep": "Entzug: Schlaf",
  "withdrawal: irritable": "Entzug: Reizbarkeit",
};
const STRENGTH = {
  none: "kein",
  weak: "schwach",
  moderate: "mittel",
  strong: "stark",
  "too few": "zu wenige Tage",
  "no variation x": "THC immer gleich",
  "no variation y": "Beschwerde immer gleich",
};
const SKIP_REASON = { "every day": "jeden Tag", rare: "nur" };
const DIRECTION = { better: "mehr THC – besser", worse: "mehr THC – schlechter" };

// Line styles for symptoms: black only, told apart by dash pattern and marker shape (b/w print).
const DASHES = ["", "3 1.5", "1 1", "4 1 1 1", "2 2"];
const MARKERS = ["circle", "square", "triangle", "diamond", "cross"];

function german(name) {
  return GERMAN[name] ?? name;
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 3,1 instead of 3.1; "–" for missing. */
function num(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toFixed(digits).replace(".", ",");
}

function dateText(key) {
  const d = dayStart(key);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function shortDate(key) {
  const d = dayStart(key);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/** Round an axis maximum up to 1, 2 or 5 × 10^n, so tick labels are readable. */
function niceMax(value) {
  if (!(value > 0)) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * power) return step * power;
  }
  return 10 * power;
}

function marker(shape, x, y) {
  const s = 1.1;
  if (shape === "circle") return `<circle cx="${x}" cy="${y}" r="${s}" fill="#fff" stroke="#000" stroke-width="0.35"/>`;
  if (shape === "square") return `<rect x="${x - s}" y="${y - s}" width="${2 * s}" height="${2 * s}" fill="#000"/>`;
  if (shape === "triangle") return `<path d="M${x},${y - s} L${x + s},${y + s} L${x - s},${y + s} Z" fill="#000"/>`;
  if (shape === "diamond")
    return `<path d="M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y} Z" fill="#fff" stroke="#000" stroke-width="0.35"/>`;
  return `<path d="M${x - s},${y - s} L${x + s},${y + s} M${x - s},${y + s} L${x + s},${y - s}" stroke="#000" stroke-width="0.4"/>`;
}

/**
 * Chart with shared columns: grey THC bars, black symptom lines (0–10, right axis), then one strip per tag.
 * columns: [{ label, thc, scores, tags }], all sizes in mm.
 */
function columnChart({ columns, symptoms, tagRows, thcLabel, barHeight = DAILY_CHART_HEIGHT }) {
  const width = 186;
  const left = 30; // room for tag names
  const right = 8;
  const stripHeight = 3.1;
  const top = 6; // room for the unit labels above the axes
  const axisY = top + barHeight;
  const stripsTop = axisY + 6;
  const height = stripsTop + tagRows.length * stripHeight + 2;
  const columnWidth = (width - left - right) / columns.length;
  const thcMax = niceMax(Math.max(...columns.map((c) => c.thc)));
  const yThc = (v) => axisY - (v / thcMax) * barHeight;
  const yScore = (v) => axisY - (v / 10) * barHeight;
  const xCenter = (i) => left + (i + 0.5) * columnWidth;

  const parts = [];
  // grid + axes
  for (const fraction of [0, 0.5, 1]) {
    const y = axisY - fraction * barHeight;
    parts.push(`<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="#bbb" stroke-width="0.2"/>`);
    parts.push(`<text x="${left - 1}" y="${y + 1}" text-anchor="end">${num(thcMax * fraction, 0)}</text>`);
    parts.push(`<text x="${width - right + 1}" y="${y + 1}">${num(10 * fraction, 0)}</text>`);
  }
  parts.push(`<text x="${left - 1}" y="${top - 3}" text-anchor="end">${esc(thcLabel)}</text>`);
  parts.push(`<text x="${width - right + 1}" y="${top - 3}">0–10</text>`);
  // THC bars
  columns.forEach((c, i) => {
    if (!(c.thc > 0)) return;
    const barWidth = columnWidth * 0.7;
    parts.push(
      `<rect x="${xCenter(i) - barWidth / 2}" y="${yThc(c.thc)}" width="${barWidth}" height="${axisY - yThc(c.thc)}" fill="#9a9a9a"/>`,
    );
  });
  // symptom lines (gaps where unrated)
  symptoms.forEach((symptom, s) => {
    let path = "";
    let penDown = false;
    const points = [];
    columns.forEach((c, i) => {
      const value = c.scores[symptom.name];
      if (value == null) {
        penDown = false;
        return;
      }
      path += `${penDown ? "L" : "M"}${xCenter(i)},${yScore(value)} `;
      penDown = true;
      points.push(marker(MARKERS[s % MARKERS.length], xCenter(i), yScore(value)));
    });
    parts.push(`<path d="${path}" fill="none" stroke="#000" stroke-width="0.45" stroke-dasharray="${DASHES[s % DASHES.length]}"/>`);
    parts.push(points.join(""));
  });
  // x labels
  columns.forEach((c, i) => {
    if (c.label) parts.push(`<text x="${xCenter(i)}" y="${axisY + 4}" text-anchor="middle">${esc(c.label)}</text>`);
  });
  // tag strips: a filled square on each column where the tag was logged
  tagRows.forEach((tag, r) => {
    const y = stripsTop + r * stripHeight;
    parts.push(`<text x="${left - 1}" y="${y + 2.6}" text-anchor="end">${esc(german(tag))}</text>`);
    parts.push(
      `<line x1="${left}" x2="${width - right}" y1="${y + stripHeight - 0.3}" y2="${y + stripHeight - 0.3}" stroke="#ddd" stroke-width="0.2"/>`,
    );
    columns.forEach((c, i) => {
      if ((c.tags[tag] ?? 0) > 0) {
        const size = Math.min(columnWidth * 0.7, 2.3);
        parts.push(`<rect x="${xCenter(i) - size / 2}" y="${y + 0.4}" width="${size}" height="${size}" fill="#000"/>`);
      }
    });
  });
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm" font-size="2.5" font-family="sans-serif">${parts.join("")}</svg>`;
}

function legend(symptoms) {
  const items = symptoms.map((symptom, s) => {
    const dash = DASHES[s % DASHES.length];
    const icon = `<svg viewBox="0 0 10 4" width="10mm" height="4mm"><path d="M0,2 L10,2" stroke="#000" stroke-width="0.45" stroke-dasharray="${dash}"/>${marker(MARKERS[s % MARKERS.length], 5, 2)}</svg>`;
    const direction = symptom.higherIsBetter ? "10 = gut" : "10 = schlecht";
    return `<span class="item">${icon} ${esc(german(symptom.name))} <span class="muted">(${direction})</span></span>`;
  });
  items.unshift(
    `<span class="item"><svg viewBox="0 0 6 4" width="6mm" height="4mm"><rect x="1" y="0.5" width="4" height="3" fill="#9a9a9a"/></svg> mg THC</span>`,
  );
  items.push(`<span class="item">■ Eintrag an diesem Tag</span>`);
  return `<div class="legend">${items.join("")}</div>`;
}

// ---------- executive summary: the first thing a reader sees ----------

const R_BAR_WIDTH = 40; // mm for |r| = 1
const TREND_ARROW = { worse: "▲", better: "▼", same: "=" };

/** Weekly mean THC per day as tiny bars (26 weeks), so the long-term course is visible at a glance. */
function sparkline(weeks) {
  const width = 70;
  const height = 16;
  const max = niceMax(Math.max(...weeks.map((w) => w.thcPerDay)));
  const barWidth = width / weeks.length;
  const bars = weeks.map((w, i) => {
    const barHeight = (w.thcPerDay / max) * (height - 3);
    return `<rect x="${i * barWidth + 0.15}" y="${height - barHeight}" width="${barWidth - 0.3}" height="${barHeight}" fill="#777"/>`;
  });
  const axis = `<text x="0" y="2.2">${num(max, 0)} mg</text><line x1="0" x2="${width}" y1="${height}" y2="${height}" stroke="#000" stroke-width="0.2"/>`;
  return `<svg viewBox="0 0 ${width} ${height + 3}" width="${width}mm" height="${height + 3}mm" font-size="2.3" font-family="sans-serif">${axis}${bars.join("")}
    <text x="0" y="${height + 2.7}">${shortDate(weeks[0].key)}</text><text x="${width}" y="${height + 2.7}" text-anchor="end">heute</text></svg>`;
}

/**
 * Bar for one r: length = |r|, filled black when more THC goes with "better", hatched when "worse",
 * light grey when there is no clear relation. Ticks at the Cohen thresholds 0,1 / 0,3 / 0,5.
 */
function rBar(result, symptom) {
  const ticks = [R_WEAK, R_MODERATE, R_STRONG]
    .map((t) => `<line x1="${t * R_BAR_WIDTH}" x2="${t * R_BAR_WIDTH}" y1="0" y2="3.4" stroke="#999" stroke-width="0.2"/>`)
    .join("");
  let bar = "";
  if (result.r != null) {
    const direction = relationDirection(result.r, symptom.higherIsBetter);
    let fill = "#ccc";
    if (direction === "better") fill = "#000";
    if (direction === "worse") fill = "url(#hatch)";
    bar = `<rect x="0" y="0.6" width="${Math.abs(result.r) * R_BAR_WIDTH}" height="2.2" fill="${fill}" stroke="#000" stroke-width="0.15"/>`;
  }
  return `<svg viewBox="0 0 ${R_BAR_WIDTH} 3.4" width="${R_BAR_WIDTH}mm" height="3.4mm"><line x1="0" x2="${R_BAR_WIDTH}" y1="1.7" y2="1.7" stroke="#bbb" stroke-width="0.2"/>${ticks}${bar}</svg>`;
}

/** Top block: long-term course + key numbers (left), how each symptom goes with THC + strongest factor (right). */
function summaryBlock({ shortDays, longDays, weeks, longCorrelations, factorHighlight }) {
  const shortThc = shortDays.map((d) => d.thc);
  const longThc = longDays.map((d) => d.thc);
  const rate = weeklyRate(shortThc);
  const rateWord = { worse: "steigend", better: "fallend", same: "stabil" }[rate.direction];
  const freeShort = shortDays.filter((d) => d.thc === 0).length;
  const freeLong = longDays.filter((d) => d.thc === 0).length;
  const numbers = [
    `<b>Ø ${num(mean(shortThc))}</b> mg THC/Tag (4 Wo) · ${num(mean(longThc))} (6 Mon)`,
    `Median ${num(median(shortThc))} (4 Wo) · ${num(median(longThc))} (6 Mon)`,
    `Konsumfrei: <b>${freeShort}/${shortDays.length}</b> Tage (4 Wo) · ${freeLong}/${longDays.length} (6 Mon)`,
    `Trend 4 Wo: <b>${TREND_ARROW[rate.direction]} ${rateWord}</b>, ${rate.perWeek > 0 ? "+" : ""}${num(rate.perWeek)} mg/Tag pro Woche`,
    `Ø CBD ${num(mean(shortDays.map((d) => d.cbd)))} mg/Tag (4 Wo)`,
  ];
  const rows = longCorrelations.map((row) => {
    const words = verdict(row.sameDay, row.symptom);
    return `<tr><td>${esc(german(row.symptom.name))}</td><td>${rBar(row.sameDay, row.symptom)}</td><td>${words}</td></tr>`;
  });
  return `<svg width="0" height="0" style="position:absolute"><defs><pattern id="hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.5" height="1.2" fill="#000"/></pattern></defs></svg>
  <div class="summary">
    <div class="summary-left">${sparkline(weeks)}<div class="numbers">${numbers.map((n) => `<div>${n}</div>`).join("")}</div></div>
    <div class="summary-right">
      <div class="muted">Mehr THC am Tag geht einher mit … (6 Mon, Balken = Stärke |r|; ■ besser ▨ schlechter)</div>
      <table class="bars">${rows.join("")}</table>
      ${factorHighlight ? `<div class="highlight">${factorHighlight}</div>` : ""}
    </div>
  </div>`;
}

/** The one factor line worth reading first: the biggest THC difference with/without a tag, or the strongest amount r. */
function strongestFactor(comparisonRows, amountRows) {
  const lines = [];
  const byDifference = [...comparisonRows].sort((a, b) => Math.abs(b.thcWith - b.thcWithout) - Math.abs(a.thcWith - a.thcWithout));
  const top = byDifference[0];
  if (top)
    lines.push(`<b>${esc(german(top.tag))}</b>: ${num(top.thcWith)} statt ${num(top.thcWithout)} mg THC/Tag an ${top.daysWith} Tagen`);
  const usable = amountRows.filter((row) => row.thc.r != null);
  const strongestAmount = usable.sort((a, b) => Math.abs(b.thc.r) - Math.abs(a.thc.r))[0];
  if (strongestAmount && Math.abs(strongestAmount.thc.r) >= R_WEAK) {
    lines.push(`<b>${esc(german(strongestAmount.tag))}</b> (Menge): ${amountVsThc(strongestAmount.tag, strongestAmount.thc)}`);
  }
  if (lines.length === 0) return "";
  return `Stärkste Begleitfaktoren: ${lines.join(" · ")}`;
}

function rText(result) {
  if (result.r == null) return `– <span class="muted">(n=${result.n})</span>`;
  return `${num(result.r, 2)} <span class="muted">(n=${result.n})</span>`;
}

function verdict(result, symptom) {
  const strength = strengthLabel(result);
  const direction = relationDirection(result.r, symptom.higherIsBetter);
  if (!direction) return STRENGTH[strength];
  return `${STRENGTH[strength]}: ${DIRECTION[direction]}`;
}

function correlationTable(shortDays, longDays, symptoms) {
  const shortRows = useCorrelations(shortDays, symptoms);
  const longRows = useCorrelations(longDays, symptoms);
  const rows = longRows.map((long, i) => {
    const short = shortRows[i];
    return `<tr>
      <td>${esc(german(long.symptom.name))}</td>
      <td>${num(long.freeMean)} <span class="muted">(${long.freeN} T)</span></td>
      <td>${num(long.useMean)} <span class="muted">(${long.useN} T)</span></td>
      <td>${rText(short.sameDay)}</td>
      <td>${rText(long.sameDay)}</td>
      <td>${rText(long.nextDay)}</td>
      <td>${verdict(long.sameDay, long.symptom)}</td>
    </tr>`;
  });
  return `<table class="data">
    <tr><th>Beschwerde 0–10</th><th>Ø konsumfrei</th><th>Ø Konsumtage</th><th>r 4 Wo</th><th>r 6 Mon</th><th>r Folgetag</th><th>Einordnung (6 Mon)</th></tr>
    ${rows.join("")}
  </table>`;
}

/** "Medikament (jeden Tag), Alkohol (nur 2 Tage)": tags that can't be compared, so the doctor knows they were logged. */
function skippedLine(skipped) {
  if (skipped.length === 0) return "";
  const parts = skipped.map((s) => {
    if (s.reason === "every day") return `${esc(german(s.tag))} (${SKIP_REASON["every day"]})`;
    return `${esc(german(s.tag))} (${SKIP_REASON.rare} ${s.daysWith} ${s.daysWith === 1 ? "Tag" : "Tage"})`;
  });
  return `<p class="muted">Ohne Vergleich (mind. 3 Tage mit und ohne nötig): ${parts.join(", ")}</p>`;
}

/** Summary wording: "mehr Schlaf – weniger THC (mittel, r −0,35)". */
function amountVsThc(tag, result) {
  if (result.r == null) return STRENGTH[result.reason];
  const words = STRENGTH[strengthLabel(result)];
  if (Math.abs(result.r) < R_WEAK) return `${words} (r ${num(result.r, 2)})`;
  return `mehr ${esc(german(tag))} – ${result.r > 0 ? "mehr" : "weniger"} THC (${words}, r ${num(result.r, 2)})`;
}

/** Table cell, short (the row already names the tag): "−0,35 mittel: weniger THC". */
function amountVsThcCell(result) {
  if (result.r == null) return STRENGTH[result.reason];
  const words = STRENGTH[strengthLabel(result)];
  if (Math.abs(result.r) < R_WEAK) return `${num(result.r, 2)} ${words}`;
  return `${num(result.r, 2)} ${words}: ${result.r > 0 ? "mehr" : "weniger"} THC`;
}

/** "Angst: r −0,41 mittel, besser" — the symptom that goes most with the amount. */
function amountVsSymptom(row) {
  if (!row.symptom) return "–";
  const direction = relationDirection(row.symptomResult.r, row.symptom.higherIsBetter);
  const words = STRENGTH[strengthLabel(row.symptomResult)];
  const better = { better: "besser", worse: "schlechter" }[direction];
  return `${esc(german(row.symptom.name))} ${num(row.symptomResult.r, 2)} ${words}${better ? `, ${better}` : ""}`;
}

/**
 * Tags logged with a number (sleep h, medication mg): r of the amount with THC and symptoms.
 * Works for daily tags, where "with vs without" is impossible. Returns { html, coveredTags }.
 */
function amountTable(longDays, valuedTags, symptoms) {
  const rows = valueCorrelations(
    longDays,
    valuedTags.map((t) => t.tag),
    symptoms,
  )
    // Same amount every day (e.g. a fixed medication dose) says nothing; such tags stay "ohne Vergleich".
    .filter((row) => row.n >= MIN_PAIRED_DAYS && row.thc.reason !== "no variation x")
    .slice(0, MAX_AMOUNT_ROWS);
  if (rows.length === 0) return { html: "", coveredTags: [] };
  const unitOf = (tag) => valuedTags.find((t) => t.tag === tag).unit;
  const tableRows = rows.map(
    (row) =>
      `<tr><td>${esc(german(row.tag))} (${esc(unitOf(row.tag))})</td><td>${row.n}</td><td>${amountVsThcCell(row.thc)}</td><td>${amountVsSymptom(row)}</td></tr>`,
  );
  const html = `<table class="data">
    <tr><th>Menge</th><th>Tage</th><th>r mit THC</th><th>stärkstes r Beschwerde</th></tr>
    ${tableRows.join("")}
  </table>`;
  return { html, coveredTags: rows.map((row) => row.tag) };
}

function factorTable(longDays, tags, symptoms, valuedTags) {
  const amounts = amountTable(longDays, valuedTags, symptoms);
  const comparison = tagComparisons(longDays, tags, symptoms);
  const rows = comparison.rows;
  // A daily tag covered by the amount table is not "without comparison" any more.
  const skipped = comparison.skipped.filter((s) => !amounts.coveredTags.includes(s.tag));
  const tableRows = rows
    .sort((a, b) => Math.abs(b.thcWith - b.thcWithout) - Math.abs(a.thcWith - a.thcWithout))
    .slice(0, MAX_FACTOR_ROWS)
    .map((row) => {
      const change = row.symptom ? `${esc(german(row.symptom.name))} ${num(row.scoreWith)} / ${num(row.scoreWithout)}` : "–";
      return `<tr><td>${esc(german(row.tag))}</td><td>${row.daysWith}</td><td>${num(row.thcWith)} / ${num(row.thcWithout)}</td><td>${change}</td></tr>`;
    });
  const withWithout =
    tableRows.length === 0
      ? ""
      : `<table class="data">
    <tr><th>Begleitfaktor</th><th>Tage</th><th>THC mit/ohne</th><th>Beschwerde mit/ohne</th></tr>
    ${tableRows.join("")}
  </table>`;
  // Side by side: density is fine on paper, and it keeps the report on one page.
  const content = `<div class="two-tables"><div>${withWithout}</div><div>${amounts.html}</div></div>${skippedLine(skipped)}`;
  if (!withWithout && !amounts.html && !skipped.length) return `<p class="muted">Keine Begleitfaktoren eingetragen.</p>`;
  return content;
}

/**
 * The whole report. entries must already be expanded (vaporizer loads split, see calc.js expandLoads).
 * { entries, settings, mode, todayKey, appVersion, sourceUrl, contextTags, watchTags }
 */
export function buildReport({ entries, settings, mode, todayKey, appVersion, sourceUrl, contextTags, watchTags }) {
  const byDay = groupByDay(entries);
  const shortKeys = dayRange(addDays(todayKey, -(SHORT_DAYS - 1)), todayKey);
  const longKeys = dayRange(addDays(todayKey, -(LONG_WEEKS * 7 - 1)), todayKey);
  const shortDays = dailySeries(shortKeys, byDay, mode);
  const longDays = dailySeries(longKeys, byDay, mode);
  // Symptoms never rated in 6 months would only add empty rows and legend entries.
  const symptoms = settings.symptoms.filter((s) => longDays.some((d) => d.scores[s.name] != null));
  const allTags = [...contextTags.map((t) => t.tag), ...watchTags.map((t) => t.tag)];

  // Only tags that appear in the 4 weeks get a strip, most frequent first.
  const tagRows = allTags
    .map((tag) => ({ tag, days: shortDays.filter((d) => (d.tags[tag] ?? 0) > 0).length }))
    .filter((t) => t.days > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, MAX_TAG_ROWS)
    .map((t) => t.tag);

  const shortColumns = shortDays.map((d, i) => ({ ...d, label: i % 7 === 0 || i === shortDays.length - 1 ? shortDate(d.key) : "" }));
  const weeks = weeklySeries(longDays);
  const longColumns = weeks.map((w, i) => ({ thc: w.thcPerDay, scores: w.scores, tags: {}, label: i % 4 === 0 ? shortDate(w.key) : "" }));

  const freeDaysTotal = useFreeDays(longKeys, byDay);
  const valuedTags = contextTags.filter((t) => t.unit);
  const amountRows = valueCorrelations(
    longDays,
    valuedTags.map((t) => t.tag),
    symptoms,
  ).filter((row) => row.n >= MIN_PAIRED_DAYS && row.thc.reason !== "no variation x");
  const factorHighlight = strongestFactor(tagComparisons(longDays, allTags, symptoms).rows, amountRows);
  return `<div class="report">
    <header>
      <h1>Cannabis-Tagebuch – Bericht</h1>
      <div>Zeitraum ${dateText(longKeys[0])} – ${dateText(todayKey)} · erstellt am ${dateText(todayKey)} · Einheit: mg THC${mode === "raw" ? " (Etikett)" : ""} · Selbstauskunft</div>
    </header>
    ${summaryBlock({ shortDays, longDays, weeks, longCorrelations: useCorrelations(longDays, symptoms), factorHighlight })}
    <h2>Letzte 4 Wochen (Tageswerte)</h2>
    ${columnChart({ columns: shortColumns, symptoms, tagRows, thcLabel: "mg THC" })}
    ${legend(symptoms)}
    <h2>Letzte 6 Monate (Wochenmittel)</h2>
    ${columnChart({ columns: longColumns, symptoms, tagRows: [], thcLabel: "Ø mg/Tag", barHeight: WEEKLY_CHART_HEIGHT })}
    <h2>Zusammenhang THC und Beschwerden</h2>
    ${correlationTable(shortDays, longDays, symptoms)}
    <h2>Begleitfaktoren (6 Monate)</h2>
    ${factorTable(
      longDays,
      allTags,
      symptoms,
      contextTags.filter((t) => t.unit),
    )}
    <footer>
      Methode: Tageswerte (Konsum = Summe mg THC des Tages, konsumfreie Tage = 0; Beschwerden = Tagesmittel 0–10, nicht bewertete Tage fehlen).
      r = Pearson-Korrelation, ab mind. 10 Tagen mit Werten; |r| ab 0,1 schwach, 0,3 mittel, 0,5 stark (Cohen 1988). „Folgetag“ = THC heute gegen Beschwerde morgen.
      Korrelation zeigt keine Ursache; bei vielen Vergleichen sind einzelne Werte nur Hinweise. ${freeDaysTotal} konsumfreie Tage in 6 Monaten.
      Cannalog ${esc(appVersion)} · ${esc(sourceUrl)}
    </footer>
  </div>`;
}

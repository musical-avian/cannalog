// SPDX-License-Identifier: AGPL-3.0-only
// DOM only. All math lives in calc.js, all data rules in store.js.
// Debug: open the console and run cannalog.dump(), or add ?debug to the URL.

import {
  activeMg,
  addDays,
  CALC_MODES,
  dailySeries,
  dailyThcSeries,
  dayKey,
  dayRange,
  dayStart,
  doseRelief,
  entriesBetween,
  expandLoads,
  goodness,
  groupByDay,
  isDose,
  isSip,
  keysSinceFirstEntry,
  LEVEL_BASELINE_DAYS,
  LEVEL_MIN_BASELINE_DAYS,
  LEVEL_RECENT_DAYS,
  levelChange,
  MIN_PAIRED_DAYS,
  mean,
  median,
  mgPerUnit,
  needsAfterRating,
  planForMg,
  R_WEAK,
  RATE_WINDOW_DAYS,
  rangeText,
  ratioText,
  relationDirection,
  rollingAverage,
  round1,
  smoothTrend,
  strengthLabel,
  summarize,
  tagComparisons,
  thcShare,
  trend,
  usageChange,
  useCorrelations,
  useFreeDays,
  valueCorrelations,
  weeklyRate,
  weekStart,
} from "./calc.js";
import { buildReport, LONG_WEEKS } from "./report.js";
import {
  CONTEXT_KINDS,
  CONTEXT_UNITS,
  contextTagsOf,
  emptyState,
  FORMS,
  fromJson,
  load,
  merge,
  newId,
  RESISTED_TAG,
  STORAGE_KEY,
  save,
  THEMES,
  toCsv,
  toJson,
  validateEntry,
  validateStrain,
  watchTagsOf,
} from "./store.js";

const $ = (selector) => document.querySelector(selector);
const UNDO_SECONDS = 6;
const DOWNLOAD_URL_LIFETIME_MS = 60_000;
// Shown in Settings so you can tell which version the phone runs. Bump on every release (CLAUDE.md).
const APP_VERSION = "2026-10-23.1";
// AGPL-3.0 §13: people using the hosted app must be offered the source.
const SOURCE_URL = "https://github.com/musical-avian/cannalog";
const TREND_WINDOW_DAYS = 7;
const SYMPTOM_COLORS = ["#e8590c", "#ae3ec9", "#1098ad", "#f59f00", "#d6336c", "#5c940d"];

let state = emptyState();
let view = "day";
let shownDay = dayKey(new Date());
let shownWeek = weekStart(shownDay);
let trendDays = 30;
let charts = [];

// ---------- helpers ----------

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function mode() {
  return state.settings.calcMode;
}

/** Charts, ceiling and creep use one number per day: absorbed is a wide range, so they use decarb (D5). */
function chartMode() {
  if (mode() === "absorbed") return "decarb";
  return mode();
}

/** Personal daily THC ceiling in mg, or null when not set. */
function dailyLimit() {
  return state.settings.dailyLimitMg ?? null;
}

const CHART_FONT = "13px system-ui, sans-serif";
const MARKER_HEIGHT = 0.95; // watch markers sit near the top of the mg chart (scale 0–1), above the bars

/** Save, then redraw. Every change goes through here. */
function commit() {
  try {
    save(state);
  } catch (error) {
    // Storage full or blocked: the change is only in memory now.
    alert(`Could not save on this device: ${error.message}\nExport a JSON backup now.`);
  }
  render();
}

/** Entries for all math: vaporizer loads split over their sips (calc.js expandLoads). Raw state.entries is for editing/saving. */
function mathEntries() {
  return expandLoads(state.entries);
}

function strainById(id) {
  return state.strains.find((strain) => strain.id === id);
}

function amountText(entry) {
  return `${round1(entry.amount)} ${FORMS[entry.strain.form].amountUnit}`;
}

function scoreColor(score, higherIsBetter) {
  const hue = goodness(score, higherIsBetter) * 120; // 0 = red, 120 = green
  return `hsl(${hue} 70% 45% / 0.3)`;
}

/**
 * Arrow shows the real direction (▲ went up, ▼ went down), color shows good (green) or bad (red).
 * So pain going down is a green ▼, THC going up is a red ▲.
 */
function directionSpan(direction, wentUp) {
  if (direction === "none") return "";
  if (direction === "same") return `<span class="same">=</span>`;
  const arrow = wentUp ? "▲" : "▼";
  return `<span class="${direction}">${arrow}</span>`;
}

function trendSpan(now, before, higherIsBetter, threshold) {
  return directionSpan(trend(now, before, higherIsBetter, threshold), now > before);
}

/** Usage: less is the goal, so up = red. */
function usageSpan(now, before) {
  return directionSpan(usageChange(now, before), now > before);
}

/** "exercise 30 min" chips for context tags (medication, habits). */
function contextChips(context) {
  const units = {};
  for (const t of contextTagsOf(state.settings)) units[t.tag] = t.unit;
  return (context ?? [])
    .map((item) => {
      const unit = units[item.tag] ?? "";
      const value = item.value == null ? "" : ` ${item.value}${unit === "x" ? "×" : ` ${unit}`}`;
      return `<span class="chip context">${esc(item.tag)}${esc(value)}</span>`;
    })
    .join(" ");
}

function watchChips(tags) {
  return (tags ?? []).map((tag) => `<span class="chip watch">${esc(tag)}</span>`).join(" ");
}

function effectChips(effects) {
  return effects.map((e) => `<span class="chip ${e.good ? "good" : "bad"}">${esc(e.tag)}</span>`).join(" ");
}

/** Download a file via a temporary link. Feedback via toast, because the browser may show nothing. */
function saveFile(filename, text, type) {
  const file = new File([text], filename, { type });
  // The link must be in the page, and the blob URL must live until the download has started:
  // revoking it right after click() made downloads fail on phones.
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), DOWNLOAD_URL_LIFETIME_MS);
  toast(`Saved ${filename} – check Downloads. Nothing? Use "Copy backup".`);
}

/**
 * Open the phone's share sheet (Drive, mail, Files...).
 * Sent as text/plain because Android refuses to share application/json files; the name keeps .json.
 */
async function shareFile(filename, text) {
  const file = new File([text], filename, { type: "text/plain" });
  if (!navigator.canShare?.({ files: [file] })) {
    alert('This browser cannot share files. Use "Save backup file" or "Copy backup".');
    return;
  }
  try {
    await navigator.share({ files: [file], title: filename });
  } catch (error) {
    if (error.name === "AbortError") return; // user closed the share sheet
    console.error(error);
    alert(`Sharing failed: ${error.message}\nUse "Save backup file" or "Copy backup".`);
  }
}

/** Copy the backup as text. If the clipboard is blocked, show the text so it can be copied by hand. */
async function copyBackup() {
  const json = toJson(state);
  try {
    await navigator.clipboard.writeText(json);
    toast("Backup copied. Paste it into a note or mail it to yourself.");
  } catch (error) {
    console.error(error);
    const box = $("#backup-text");
    box.hidden = false;
    box.value = json;
    box.select();
    toast("Copy blocked: long-press the text → Select all → Copy.");
  }
}

function backupFilename(extension) {
  return `cannalog-${dayKey(new Date())}.${extension}`;
}

let undoTimer;
/** Short message at the bottom. With onUndo: shows an Undo button. */
function toast(text, onUndo) {
  $("#toast-text").textContent = text;
  $("#toast").hidden = false;
  $("#toast-undo").hidden = !onUndo;
  $("#toast-undo").onclick = () => {
    $("#toast").hidden = true;
    onUndo();
  };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, UNDO_SECONDS * 1000);
}

// ---------- theme ----------

const THEME_LABELS = { auto: "Auto", light: "Light", dark: "Dark" };

function theme() {
  return state.settings.theme ?? "auto"; // older data has no theme
}

/** "auto" removes data-theme, so the CSS media query (phone setting) decides. */
function applyTheme() {
  const root = document.documentElement;
  if (theme() === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme();
  const button = $("#theme-toggle");
  button.textContent = THEME_LABELS[theme()];
  button.setAttribute("aria-label", `Theme: ${theme()}. Tap to change.`);
  button.title = `Theme: ${theme()}`;
  $('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue("--panel").trim();
}

function nextTheme() {
  const index = THEMES.indexOf(theme());
  state.settings.theme = THEMES[(index + 1) % THEMES.length];
  commit(); // render() re-applies the theme and redraws charts in the new colors
}

// ---------- views ----------

function render() {
  for (const name of ["day", "week", "trends", "calc", "settings"]) {
    $(`#view-${name}`).hidden = name !== view;
    $(`nav [data-view="${name}"]`).toggleAttribute("aria-current", name === view);
  }
  $("#add-entry").hidden = view === "settings" || view === "calc";
  $("#mode-badge").textContent = `mg = ${CALC_MODES[mode()]}`;
  applyTheme();
  if (view === "day") renderDay();
  if (view === "week") renderWeek();
  if (view === "trends") renderTrends();
  if (view === "calc") renderCalc();
  if (view === "settings") renderSettings();
}

function summaryCard(summary) {
  const ratio = ratioText(summary.thc[1], summary.cbd[1]);
  const scores = state.settings.symptoms
    .filter((s) => summary.scores[s.name] != null)
    .map((s) => {
      const value = summary.scores[s.name];
      return `<span class="chip" style="background:${scoreColor(value, s.higherIsBetter)}">${esc(s.name)} ${round1(value)}</span>`;
    })
    .join(" ");
  return `<div class="card">
    <div class="row spread">
      <span class="big thc">${rangeText(summary.thc)} mg THC</span>
      <span class="big cbd">${rangeText(summary.cbd)} mg CBD</span>
    </div>
    <div class="row spread muted"><span>ratio THC:CBD ${ratio}</span><span>${summary.count} ${summary.count === 1 ? "use" : "uses"}</span></div>
    <div class="row">${scores}</div>
  </div>`;
}

/** "24 / 30 mg THC" bar against the user's own ceiling. Empty when no ceiling is set. */
function limitMeter(thcMg) {
  const limit = dailyLimit();
  if (limit === null) return "";
  const percent = Math.min(100, (100 * thcMg) / limit);
  const over = thcMg > limit;
  return `<div class="card">
    <div class="row spread"><span>${round1(thcMg)} / ${round1(limit)} mg THC</span><span class="${over ? "worse" : "muted"}">${over ? "over your ceiling" : "your ceiling"}</span></div>
    <div class="meter ${over ? "over" : ""}"><span style="width:${percent}%"></span></div>
  </div>`;
}

function doseTitle(entry) {
  if (isSip(entry)) return `sip · ${esc(entry.strain.name)}`;
  if (entry.load) return `${esc(entry.strain.name)} load`;
  return esc(entry.strain.name);
}

/** Amount column. For loads and sips: this use's share of the load (math entries carry the share as amount). */
function doseAmountText(entry) {
  if (!entry.load && !isSip(entry)) return `${amountText(entry)} ${entry.route}`;
  const loadId = entry.sipOf ?? entry.id;
  const load = state.entries.find((e) => e.id === loadId);
  return `${amountText(entry)} of ${amountText(load)}`;
}

/** Open vaporizer loads (any day): one tap logs a sip, "Empty" closes the load. */
function openLoadsBanner() {
  const openLoads = state.entries.filter((e) => e.load?.open);
  return openLoads
    .map((load) => {
      const uses = 1 + state.entries.filter((e) => e.sipOf === load.id).length;
      const since = new Date(load.t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      return `<div class="card load-banner">
        <div class="row spread"><b>${esc(load.strain.name)} · ${amountText(load)} load</b><span class="muted">since ${since} · ${uses} ${uses === 1 ? "use" : "uses"}</span></div>
        <div class="row"><button class="primary" data-sip="${load.id}">Sip now</button><button data-empty-load="${load.id}">Empty</button></div>
      </div>`;
    })
    .join("");
}

function addSip(loadId) {
  const sip = { id: newId(), t: new Date().toISOString(), sipOf: loadId, note: "", scores: {}, effects: [], watch: [] };
  state.entries.push(sip);
  shownDay = dayKey(sip.t);
  commit();
  toast("Sip logged. Tap it to add how you feel.", () => {
    state.entries = state.entries.filter((e) => e.id !== sip.id);
    commit();
  });
}

/**
 * Close a load. The full load always counts: how much THC a dry-herb vape really extracts is
 * unknown, and a consistent upper bound keeps trends honest (docs/limits.md).
 */
function closeLoad(loadId) {
  const load = state.entries.find((e) => e.id === loadId);
  load.load = { open: false, used: 1 };
  commit();
}

/** "pain 7 → 3 · mood 4": before → after when both were rated (D30). */
function scoresText(entry) {
  const after = entry.after?.scores ?? {};
  const names = [...new Set([...Object.keys(entry.scores), ...Object.keys(after)])];
  return names
    .map((name) => {
      const before = entry.scores[name] ?? "";
      if (after[name] == null) return `${esc(name)} ${before}`;
      return `${esc(name)} ${before} → ${after[name]}`;
    })
    .join(" · ");
}

/** "How do you feel now?" for the newest dose 30 min–6 h ago without an after rating. No notifications. */
function afterRatingBanner() {
  const now = new Date();
  // mathEntries: sips carry their load's strain there, which the title needs. Ids are the stored ones.
  const waiting = mathEntries()
    .filter((e) => needsAfterRating(e, now))
    .sort((a, b) => b.t.localeCompare(a.t));
  const dose = waiting[0];
  if (!dose) return "";
  const time = new Date(dose.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `<div class="card load-banner">
    <div class="row spread"><b>How do you feel now?</b><span class="muted">${doseTitle(dose)}, ${time}</span></div>
    <div class="row"><button class="primary" data-rate-after="${dose.id}">Rate now</button><button data-skip-after="${dose.id}">Skip</button></div>
  </div>`;
}

function skipAfterRating(entryId) {
  const entry = state.entries.find((e) => e.id === entryId);
  entry.after = { t: new Date().toISOString(), scores: {} };
  commit();
  toast("Skipped", () => {
    delete entry.after;
    commit();
  });
}

function renderDay() {
  const entries = groupByDay(mathEntries())[shownDay] ?? [];
  const label = shownDay === dayKey(new Date()) ? "Today" : dayStart(shownDay).toDateString();

  // Running total: what the day adds up to after each entry.
  let runningThc = [0, 0];
  let runningCbd = [0, 0];
  const items = entries.map((entry) => {
    const active = activeMg(entry, mode());
    runningThc = [runningThc[0] + active.thc[0], runningThc[1] + active.thc[1]];
    runningCbd = [runningCbd[0] + active.cbd[0], runningCbd[1] + active.cbd[1]];
    const time = new Date(entry.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const scores = scoresText(entry);
    const details = `
      ${scores ? `<div class="muted">${scores}</div>` : ""}
      ${entry.effects.length ? `<div class="row">${effectChips(entry.effects)}</div>` : ""}
      ${entry.watch?.length ? `<div class="row">${watchChips(entry.watch)}</div>` : ""}
      ${entry.context?.length ? `<div class="row">${contextChips(entry.context)}</div>` : ""}
      ${entry.note ? `<div>📝 ${esc(entry.note)}</div>` : ""}`;
    if (!isDose(entry)) {
      return `<div class="card entry no-dose" data-id="${entry.id}"><b>${time} no dose</b>${details}</div>`;
    }
    return `<div class="card entry" data-id="${entry.id}">
      <div class="row spread"><b>${time} ${doseTitle(entry)}</b><span class="muted">${doseAmountText(entry)}</span></div>
      <div class="row spread">
        <span><span class="thc">${rangeText(active.thc)}</span> / <span class="cbd">${rangeText(active.cbd)}</span> mg</span>
        <span class="muted">day: ${rangeText(runningThc)} / ${rangeText(runningCbd)} mg</span>
      </div>
      ${details}
    </div>`;
  });

  $("#view-day").innerHTML = `
    ${afterRatingBanner()}
    ${openLoadsBanner()}
    <div class="row spread">
      <button data-day="-1" aria-label="Previous day">‹</button>
      <b>${esc(label)}</b>
      <button data-day="1" aria-label="Next day">›</button>
    </div>
    ${summaryCard(summarize(entries, mode()))}
    ${limitMeter(summarize(entries, chartMode()).thc[1])}
    ${items.join("") || `<p class="muted">Nothing logged. Tap + to add.</p>`}
    ${shownDay !== dayKey(new Date()) ? `<button data-day="today">Back to today</button>` : ""}`;
}

/** THC per day this week vs last week: mean, median, use-free days. Days without use count as 0. */
function weekUsageCard(byDay, thisWeek) {
  const thisKeys = dayRange(shownWeek, addDays(shownWeek, 6));
  const prevKeys = dayRange(addDays(shownWeek, -7), addDays(shownWeek, -1));
  const thisDaily = dailyThcSeries(thisKeys, byDay, chartMode());
  const prevDaily = dailyThcSeries(prevKeys, byDay, chartMode());
  const thisFree = useFreeDays(thisKeys, byDay);
  const prevFree = useFreeDays(prevKeys, byDay);
  const row = (label, now, before, span) =>
    `<div class="row spread"><span>${label}</span><span><b>${round1(now)}</b> ${span} <span class="muted">(prev ${round1(before)})</span></span></div>`;
  return `<h2>THC per day</h2>
    <div class="card">
      ${row("mean mg", mean(thisDaily), mean(prevDaily), usageSpan(mean(thisDaily), mean(prevDaily)))}
      ${row("median mg", median(thisDaily), median(prevDaily), usageSpan(median(thisDaily), median(prevDaily)))}
      ${row("use-free days", thisFree, prevFree, trendSpan(thisFree, prevFree, true, 1))}
      <p class="muted">THC:CBD this week ${ratioText(thisWeek.thc[1], thisWeek.cbd[1])}. Median ignores a single heavy day.</p>
    </div>`;
}

/** Watch tag counts now vs before. More is worse, except resisted urges. */
function watchRows(now, before) {
  const tags = new Set([...Object.keys(now), ...Object.keys(before)]);
  return [...tags]
    .map((tag) => ({ tag, now: now[tag] ?? 0, before: before[tag] ?? 0 }))
    .sort((a, b) => b.now - a.now)
    .map((w) => {
      const span = trendSpan(w.now, w.before, w.tag === RESISTED_TAG, 1);
      return `<div class="row spread"><span class="chip watch">${esc(w.tag)}</span><span>${w.now}× ${span} <span class="muted">(prev ${w.before})</span></span></div>`;
    })
    .join("");
}

function renderWeek() {
  const lastDay = addDays(shownWeek, 6);
  const entries = mathEntries();
  const thisWeek = summarize(entriesBetween(entries, shownWeek, lastDay), mode());
  const prevWeek = summarize(entriesBetween(entries, addDays(shownWeek, -7), addDays(shownWeek, -1)), mode());
  const byDay = groupByDay(entries);
  const symptoms = state.settings.symptoms;

  const scoreCell = (summary, symptom) => {
    const value = summary.scores[symptom.name];
    if (value == null) return "<td></td>";
    return `<td style="background:${scoreColor(value, symptom.higherIsBetter)}">${round1(value)}</td>`;
  };

  const rows = dayRange(shownWeek, lastDay).map((key) => {
    const day = summarize(byDay[key] ?? [], mode());
    const name = dayStart(key).toLocaleDateString([], { weekday: "short", day: "numeric" });
    return `<tr data-goto-day="${key}">
      <td>${esc(name)}</td>
      <td class="thc">${day.count ? round1(day.thc[1]) : ""}</td>
      <td class="cbd">${day.count ? round1(day.cbd[1]) : ""}</td>
      ${symptoms.map((s) => scoreCell(day, s)).join("")}
    </tr>`;
  });

  const totalRow = `<tr>
    <th>Week</th>
    <th class="thc">${round1(thisWeek.thc[1])}</th>
    <th class="cbd">${round1(thisWeek.cbd[1])}</th>
    ${symptoms
      .map((s) => {
        const now = thisWeek.scores[s.name];
        if (now == null) return "<th></th>";
        return `<th>${round1(now)} ${trendSpan(now, prevWeek.scores[s.name], s.higherIsBetter)}</th>`;
      })
      .join("")}
  </tr>`;

  // Effects: more good effects = better, more bad effects = worse. 1 occurrence is the smallest real change.
  const tags = new Set([...Object.keys(thisWeek.effects), ...Object.keys(prevWeek.effects)]);
  const effectRows = [...tags]
    .map((tag) => {
      const now = thisWeek.effects[tag]?.count ?? 0;
      const before = prevWeek.effects[tag]?.count ?? 0;
      const good = (thisWeek.effects[tag] ?? prevWeek.effects[tag]).good;
      return { tag, now, before, good };
    })
    .sort((a, b) => b.now - a.now)
    .map(
      (e) =>
        `<div class="row spread"><span class="chip ${e.good ? "good" : "bad"}">${esc(e.tag)}</span><span>${e.now}× ${trendSpan(e.now, e.before, e.good, 1)} <span class="muted">(prev ${e.before})</span></span></div>`,
    );

  const notes = entriesBetween(entries, shownWeek, lastDay)
    .filter((e) => e.note)
    .sort((a, b) => a.t.localeCompare(b.t))
    .map(
      (e) => `<div><span class="muted">${dayStart(dayKey(e.t)).toLocaleDateString([], { weekday: "short" })}</span> ${esc(e.note)}</div>`,
    );

  $("#view-week").innerHTML = `
    <div class="row spread">
      <button data-week="-1" aria-label="Previous week">‹</button>
      <b>Week of ${dayStart(shownWeek).toLocaleDateString([], { day: "numeric", month: "short" })}</b>
      <button data-week="1" aria-label="Next week">›</button>
    </div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th></th><th class="thc">THC</th><th class="cbd">CBD</th>${symptoms.map((s) => `<th>${esc(s.name)}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("")}</tbody>
        <tfoot>${totalRow}</tfoot>
      </table>
      <p class="muted">mg ${esc(CALC_MODES[mode()])}${mode() === "absorbed" ? " (upper end)" : ""}. Colors: green = good, red = bad. ▲▼ = up/down vs previous week.</p>
    </div>
    ${weekUsageCard(byDay, thisWeek)}
    <h2>Effects</h2>
    <div class="card">${effectRows.join("") || `<span class="muted">none logged</span>`}</div>
    <h2>Watch</h2>
    <div class="card">${watchRows(thisWeek.watch, prevWeek.watch) || `<span class="muted">none logged</span>`}</div>
    <h2>Notes</h2>
    <div class="card">${notes.join("") || `<span class="muted">none</span>`}</div>`;
}

/** Top of Trends: is usage creeping up? Always the last 4 weeks, whatever range the charts show. */
function usageCard(byDay) {
  const today = dayKey(new Date());
  const last28 = dailyThcSeries(dayRange(addDays(today, -(RATE_WINDOW_DAYS - 1)), today), byDay, chartMode());
  const last7 = last28.slice(-7);
  const prev7 = last28.slice(-14, -7);
  const freeLast7 = last7.filter((mg) => mg === 0).length;
  const freePrev7 = prev7.filter((mg) => mg === 0).length;
  const rateKeys = keysSinceFirstEntry(byDay, addDays(today, -(RATE_WINDOW_DAYS - 1)), today);
  const rate = weeklyRate(dailyThcSeries(rateKeys, byDay, chartMode()));
  const sign = rate.perWeek > 0 ? "+" : "";
  return `<div class="card">
    ${levelRow(byDay, today)}
    <div class="row spread muted"><span>Slope (4 weeks)</span><span>${sign}${round1(rate.perWeek)} mg/day per week</span></div>
    <div class="row spread"><span>Last 7 days, mean</span><span><b>${round1(mean(last7))}</b> mg/day ${usageSpan(mean(last7), mean(prev7))} <span class="muted">(prev ${round1(mean(prev7))})</span></span></div>
    <div class="row spread"><span>Use-free days</span><span><b>${freeLast7}</b> ${trendSpan(freeLast7, freePrev7, true, 1)} <span class="muted">(prev ${freePrev7})</span></span></div>
    ${watchLast7VsPrev7(today)}
  </div>`;
}

/** Main creep signal: typical (median) day of the last week vs the 4 weeks before. */
function levelRow(byDay, today) {
  const firstKey = addDays(today, -(LEVEL_RECENT_DAYS + LEVEL_BASELINE_DAYS - 1));
  const keys = keysSinceFirstEntry(byDay, firstKey, today);
  const level = levelChange(dailyThcSeries(keys, byDay, chartMode()));
  const label = `<span>Typical day, last ${LEVEL_RECENT_DAYS} days</span>`;
  if (level.direction === null) {
    const missing = LEVEL_RECENT_DAYS + LEVEL_MIN_BASELINE_DAYS - keys.length;
    return `<div class="row spread">${label}<span class="muted">needs ${missing} more days of log</span></div>`;
  }
  const words = { worse: "rising", better: "falling", same: "stable" };
  let percent = "";
  if (level.fraction !== null) percent = ` ${level.fraction > 0 ? "+" : ""}${Math.round(level.fraction * 100)}%`;
  const arrow = directionSpan(level.direction, level.recent > level.baseline);
  return `<div class="row spread">${label}<span><b>${round1(level.recent)}</b> mg ${arrow} <span class="${level.direction}">${words[level.direction]}${percent}</span>
    <span class="muted">(vs ${round1(level.baseline)}, ${level.baselineDays} days before)</span></span></div>`;
}

/** Watch tags in the last 7 days vs the 7 before. Empty if none were logged in either. */
function watchLast7VsPrev7(today) {
  const entries = mathEntries();
  const last7 = summarize(entriesBetween(entries, addDays(today, -6), today), chartMode()).watch;
  const prev7 = summarize(entriesBetween(entries, addDays(today, -13), addDays(today, -7)), chartMode()).watch;
  const rows = watchRows(last7, prev7);
  if (!rows) return "";
  return `<p class="muted">Watch, last 7 days</p>${rows}`;
}

const STRENGTH_WORDS = {
  none: "no link",
  weak: "weak",
  moderate: "moderate",
  strong: "strong",
  "too few": "too few days",
  "no variation x": "THC always the same",
  "no variation y": "score always the same",
};

/** "less pain", "higher mood": how the symptom moves when it gets better or worse. */
function symptomChangeWords(symptom, direction) {
  const goesUp = (direction === "better") === symptom.higherIsBetter;
  if (symptom.higherIsBetter) return `${goesUp ? "higher" : "lower"} ${esc(symptom.name)}`;
  return `${goesUp ? "more" : "less"} ${esc(symptom.name)}`;
}

/** "sleep amount (37 days): more → less THC (moderate) · anxiety less (strong)" */
function amountLine(row) {
  const thcWords = STRENGTH_WORDS[strengthLabel(row.thc)];
  let thcText = thcWords;
  if (row.thc.r != null && Math.abs(row.thc.r) >= R_WEAK) {
    const moreOrLess = row.thc.r > 0 ? "more" : "less";
    thcText = `more → ${moreOrLess} THC (${thcWords})`;
  }
  let symptomText = "";
  if (row.symptom) {
    const direction = relationDirection(row.symptomResult.r, row.symptom.higherIsBetter);
    const words = STRENGTH_WORDS[strengthLabel(row.symptomResult)];
    symptomText = direction ? ` · ${symptomChangeWords(row.symptom, direction)} (${words})` : "";
  }
  return `<div class="row spread"><span class="chip">${esc(row.tag)} amount</span><span>${row.n} days: ${thcText}${symptomText}</span></div>`;
}

/** Correlations over the last 6 months: does THC go with better or worse symptoms? Which factors go with less use? */
function correlationsCard() {
  const today = dayKey(new Date());
  const keys = dayRange(addDays(today, -(LONG_WEEKS * 7 - 1)), today);
  const days = dailySeries(keys, groupByDay(mathEntries()), chartMode());
  const symptoms = state.settings.symptoms;
  const rows = useCorrelations(days, symptoms).map((row) => {
    const direction = relationDirection(row.sameDay.r, row.symptom.higherIsBetter);
    const words = STRENGTH_WORDS[strengthLabel(row.sameDay)];
    const verdict = direction ? `${words}: more THC, ${symptomChangeWords(row.symptom, direction)}` : words;
    const css = direction ?? "same";
    const r = row.sameDay.r == null ? "–" : row.sameDay.r.toFixed(2);
    return `<tr><td>${esc(row.symptom.name)}</td><td>${row.freeMean == null ? "–" : round1(row.freeMean)}</td><td>${row.useMean == null ? "–" : round1(row.useMean)}</td><td>${r}</td><td class="${css}">${verdict}</td></tr>`;
  });
  const tags = [...contextTagsOf(state.settings), ...watchTagsOf(state.settings)].map((t) => t.tag);
  const comparisons = tagComparisons(days, tags, symptoms);
  const factors = comparisons.rows.map(
    (f) =>
      `<div class="row spread"><span class="chip">${esc(f.tag)}</span><span>${f.daysWith} days · THC ${round1(f.thcWith)} with / ${round1(f.thcWithout)} without (mg/day)</span></div>`,
  );
  // Logged amounts (sleep h, medication mg): r with THC and the strongest symptom. Works for daily tags too.
  const valued = contextTagsOf(state.settings).filter((t) => t.unit);
  const amounts = valueCorrelations(
    days,
    valued.map((t) => t.tag),
    symptoms,
  ).filter((a) => a.n >= MIN_PAIRED_DAYS && a.thc.reason !== "no variation x"); // same amount every day: nothing to learn
  for (const a of amounts) factors.push(amountLine(a));
  // Tags logged (almost) every day or only 1–2 times can't be compared; say so instead of hiding them.
  const covered = new Set(amounts.map((a) => a.tag));
  const skipped = comparisons.skipped
    .filter((s) => !covered.has(s.tag))
    .map((s) => `${esc(s.tag)} (${s.reason === "every day" ? "every day" : `only ${s.daysWith}×`})`);
  if (skipped.length) factors.push(`<p class="muted">Not comparable (need ≥ 3 days with and without): ${skipped.join(", ")}</p>`);
  return `<h2>Correlations <span class="muted">(6 months, same day)</span></h2>
    <div class="card" style="overflow-x:auto">
      <table><thead><tr><th></th><th>use-free</th><th>use days</th><th>r</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>
      <p class="muted">Mean score on use-free days vs use days; r = correlation of daily THC with the score (≥ 10 days). Goes together ≠ causes.</p>
      ${factors.join("") || `<p class="muted">Factors: need ≥ 3 days with and without a tag.</p>`}
      <button type="button" class="primary" data-report="pdf">Doctor report (PDF)</button>
    </div>`;
}

/** "~40 min" / "~1.5 h" */
function durationText(minutes) {
  if (minutes < 90) return `~${Math.round(minutes)} min`;
  return `~${round1(minutes / 60)} h`;
}

/** Before → after a dose, per symptom (D30). Only doses where both were rated. */
function reliefCard() {
  const today = dayKey(new Date());
  const entries = entriesBetween(mathEntries(), addDays(today, -(LONG_WEEKS * 7 - 1)), today);
  const rows = doseRelief(entries, state.settings.symptoms)
    .filter((row) => row.n > 0)
    .map((row) => {
      const sign = row.change > 0 ? "+" : "";
      const arrow = directionSpan(row.direction, row.change > 0);
      return `<div class="row spread"><span>${esc(row.symptom.name)}</span><span>${round1(row.before)} → <b>${round1(row.after)}</b> ${arrow} <span class="${row.direction}">${sign}${round1(row.change)}</span>
        <span class="muted">· n ${row.n} · ${durationText(row.medianMinutes)} later</span></span></div>`;
    });
  const body = rows.join("") || `<p class="muted">Rate "after" on a dose (Day view banner or edit the entry) to see this.</p>`;
  return `<h2>Change after a dose <span class="muted">(6 months)</span></h2>
    <div class="card">${body}
      <p class="muted">Self-rated, no comparison with waiting without a dose; you tend to dose when it's worst, so some of the change would happen anyway.</p>
    </div>`;
}

/** Fill #report with the German A4 report and open the print dialog ("Save as PDF"). */
function printDoctorReport() {
  $("#report").innerHTML = buildReport({
    entries: mathEntries(),
    settings: state.settings,
    mode: chartMode(),
    todayKey: dayKey(new Date()),
    appVersion: APP_VERSION,
    sourceUrl: SOURCE_URL,
    contextTags: contextTagsOf(state.settings),
    watchTags: watchTagsOf(state.settings),
  });
  toast('In the print dialog pick "Save as PDF" or a printer.');
  window.print();
}

/** Daily THC from the first entry (or range start) to today, so the smoothed trend is warmed up before the range starts. */
function smoothedThc(byDay, keys) {
  const firstEntryDay = Object.keys(byDay).sort()[0] ?? keys[0];
  const startKey = firstEntryDay < keys[0] ? firstEntryDay : keys[0];
  const allKeys = dayRange(startKey, keys[keys.length - 1]);
  const trendLine = smoothTrend(dailyThcSeries(allKeys, byDay, chartMode()));
  return trendLine.slice(-keys.length);
}

function renderTrends() {
  for (const chart of charts) chart.destroy();
  charts = [];

  const today = dayKey(new Date());
  const keys = dayRange(addDays(today, -(trendDays - 1)), today);
  const byDay = groupByDay(mathEntries());
  const days = keys.map((key) => summarize(byDay[key] ?? [], chartMode()));
  const x = keys.map((key) => dayStart(key).getTime() / 1000);
  const thc = days.map((d) => (d.count ? d.thc[1] : null));
  const cbd = days.map((d) => (d.count ? d.cbd[1] : null));
  const share = days.map((d) => thcShare(d.thc[1], d.cbd[1]));
  const thcTrend = smoothedThc(byDay, keys);
  const watchCounts = days.map((d) => Object.values(d.watch).reduce((sum, n) => sum + n, 0));
  const watchMarkers = watchCounts.map((count) => (count > 0 ? MARKER_HEIGHT : null));
  const limit = dailyLimit();
  const limitLine = keys.map(() => limit);
  const symptoms = state.settings.symptoms;
  const symptomLines = symptoms.map((s) =>
    rollingAverage(
      days.map((d) => d.scores[s.name] ?? null),
      TREND_WINDOW_DAYS,
    ),
  );

  $("#view-trends").innerHTML = `
    <h2>Usage</h2>
    ${usageCard(byDay)}
    <div class="row">${[7, 30, 90].map((n) => `<button data-range="${n}" ${n === trendDays ? 'class="primary"' : ""}>${n} d</button>`).join("")}</div>
    <h2>THC / CBD per day (mg ${esc(CALC_MODES[chartMode()])})</h2>
    <div class="card"><div id="chart-mg" class="chart"></div></div>
    <h2>Symptoms (${TREND_WINDOW_DAYS}-day average, 0–10)</h2>
    <div class="card"><div id="chart-scores" class="chart"></div></div>
    <h2>Notes <span class="muted" id="notes-day">(tap a day on a chart)</span></h2>
    <div class="card" id="notes-list"><span class="muted">–</span></div>
    ${reliefCard()}
    ${correlationsCard()}`;

  const width = $("#chart-mg").clientWidth;
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const axis = {
    stroke: color("--muted"),
    font: CHART_FONT,
    labelFont: CHART_FONT,
    size: 48,
    grid: { stroke: color("--line") },
    ticks: { stroke: color("--line") },
  };
  const bars = (align) => uPlot.paths.bars({ size: [0.4, 40], align });

  // Show notes of the day under the cursor, so mood text sits next to the numbers.
  const showNotes = (u) => {
    const index = u.cursor.idx;
    if (index == null) return;
    const key = keys[index];
    const withText = (byDay[key] ?? []).filter((e) => e.note || e.watch?.length);
    $("#notes-day").textContent = dayStart(key).toDateString();
    $("#notes-list").innerHTML =
      withText
        .map((e) => {
          const label = isDose(e) ? esc(e.strain.name) : "no dose";
          return `<div>${label}: ${watchChips(e.watch)} ${esc(e.note)}</div>`;
        })
        .join("") || `<span class="muted">no notes</span>`;
  };
  const cursor = { sync: { key: "cannalog" } };
  const hooks = { setCursor: [showNotes] };

  const mgSeries = [
    {},
    { label: "THC", stroke: color("--thc"), fill: color("--thc"), paths: bars(-1), points: { show: false } },
    { label: "CBD", stroke: color("--cbd"), fill: color("--cbd"), paths: bars(1), points: { show: false } },
    { label: "THC trend", stroke: color("--text"), width: 3, points: { show: false } },
    { label: "THC %", stroke: "#7048e8", scale: "share", width: 2, spanGaps: true },
    {
      // Markers along the top on days with watch tags (cravings etc.). Legend shows the day's count.
      label: "watch",
      scale: "marker",
      stroke: color("--watch"),
      fill: color("--watch"),
      paths: () => null,
      points: { show: true, size: 14, fill: color("--watch") },
      value: (_chart, _raw, _seriesIndex, index) => (index == null ? "–" : `${watchCounts[index]}×`),
    },
  ];
  const mgData = [x, thc, cbd, thcTrend, share, watchMarkers];
  if (limit !== null) {
    mgSeries.push({ label: "ceiling", stroke: color("--bad"), dash: [8, 6], width: 2, points: { show: false } });
    mgData.push(limitLine);
  }

  charts.push(
    new uPlot(
      {
        width,
        height: 240,
        cursor,
        hooks,
        scales: { x: { time: true }, share: { range: [0, 100] }, marker: { range: [0, 1] } },
        axes: [axis, { ...axis, label: "mg" }, { ...axis, scale: "share", side: 1, grid: { show: false }, label: "THC %" }],
        series: mgSeries,
      },
      mgData,
      $("#chart-mg"),
    ),
  );

  charts.push(
    new uPlot(
      {
        width,
        height: 200,
        cursor,
        hooks,
        scales: { x: { time: true }, y: { range: [0, 10] } },
        axes: [axis, axis],
        series: [
          {},
          ...symptoms.map((s, i) => ({
            label: `${s.name}${s.higherIsBetter ? " ↑good" : " ↓good"}`,
            stroke: SYMPTOM_COLORS[i % SYMPTOM_COLORS.length],
            width: 3,
            spanGaps: true,
          })),
        ],
      },
      [x, ...symptomLines],
      $("#chart-scores"),
    ),
  );
}

function renderSettings() {
  const settings = state.settings;
  const modeHelp = {
    raw: "label value × amount",
    decarb: "× 0.877 if the label lists THCA/CBDA (derived)",
    absorbed: "× bioavailability range: THC inhaled 2–56%, oral 4–12% (very wide)",
  };
  const strains = state.strains
    .map(
      (s) =>
        `<div class="row spread card entry" data-strain="${s.id}"><b>${esc(s.name)}</b><span class="muted">${s.form} · THC ${s.thc} / CBD ${s.cbd} ${FORMS[s.form].strengthUnit}${s.acid ? " (acid)" : ""}</span></div>`,
    )
    .join("");
  const symptoms = settings.symptoms
    .map(
      (s, i) => `<div class="row spread"><span>${esc(s.name)}</span><span class="row">
        <label class="row"><input type="checkbox" data-symptom-dir="${i}" ${s.higherIsBetter ? "checked" : ""}/> higher = better</label>
        <button class="danger" data-symptom-remove="${i}" aria-label="Remove ${esc(s.name)}">✕</button></span></div>`,
    )
    .join("");
  const tags = settings.effectTags
    .map((t, i) => `<button class="chip ${t.good ? "good" : "bad"}" aria-pressed="true" data-tag-remove="${i}">${esc(t.tag)} ✕</button>`)
    .join(" ");
  const debug = new URLSearchParams(location.search).has("debug") ? `<h2>Debug</h2><pre>${esc(toJson(state))}</pre>` : "";

  $("#view-settings").innerHTML = `
    <h2>mg shown as</h2>
    <div class="card">${Object.entries(CALC_MODES)
      .map(
        ([key, label]) =>
          `<label class="row"><input type="radio" name="calc-mode" value="${key}" ${key === settings.calcMode ? "checked" : ""}/> <b>${label}</b> <span class="muted">${modeHelp[key]}</span></label>`,
      )
      .join("")}</div>

    <h2>Personal daily ceiling</h2>
    <form class="card" id="limit-form">
      <label class="field"><span>Max THC per day (mg, ${esc(CALC_MODES[chartMode()])}). Your own number, not a recommendation. Empty = off.</span>
        <input name="dailyLimit" type="number" inputmode="decimal" step="any" min="0" value="${dailyLimit() ?? ""}" /></label>
      <button type="submit">Save ceiling</button>
    </form>

    <h2>Strains / products</h2>
    ${strains || `<p class="muted">none yet</p>`}
    <button id="strain-add">+ Add strain / product</button>

    <h2>Symptoms (0–10)</h2>
    <div class="card">${symptoms}
      <form class="row" id="symptom-form" style="flex-wrap:nowrap"><input name="symptomName" placeholder="new symptom" required /><button>Add</button></form>
    </div>

    <h2>Effect tags</h2>
    <div class="card"><div class="row">${tags}</div>
      <form class="row" id="tag-form" style="flex-wrap:nowrap; margin-top:8px">
        <input name="tag" placeholder="new effect" required />
        <select name="good" style="width:auto"><option value="true">good</option><option value="false">bad</option></select>
        <button>Add</button>
      </form>
    </div>

    <h2>Context tags <span class="muted">(meds, habits; tap to remove)</span></h2>
    <div class="card"><div class="row">${contextTagsOf(settings)
      .map(
        (t, i) =>
          `<button class="chip context" aria-pressed="true" data-context-remove="${i}">${esc(t.tag)}${t.unit ? ` (${t.unit})` : ""} ${t.kind === "beneficial" ? "+" : ""} ✕</button>`,
      )
      .join(" ")}</div>
      <form class="row" id="context-form" style="margin-top:8px">
        <input name="contextTag" placeholder="e.g. a medication name" required style="flex:2" />
        <select name="kind" style="flex:1">${CONTEXT_KINDS.map((k) => `<option value="${k}">${k}</option>`).join("")}</select>
        <select name="unit" style="flex:1">${CONTEXT_UNITS.map((u) => `<option value="${u}">${u || "no value"}</option>`).join("")}</select>
        <button>Add</button>
      </form>
    </div>

    <h2>Doctor report</h2>
    <div class="card"><p class="muted">One A4 page in German, black/white: 4 weeks + 6 months, THC next to symptoms and tags.</p>
      <button type="button" class="primary" data-report="pdf">Doctor report (PDF)</button></div>

    <h2>Watch tags <span class="muted">(cravings etc., tap to remove)</span></h2>
    <div class="card"><div class="row">${watchTagsOf(settings)
      .map((t, i) => `<button class="chip watch" aria-pressed="true" data-watch-remove="${i}">${esc(t.tag)} ✕</button>`)
      .join(" ")}</div>
      <form class="row" id="watch-form" style="flex-wrap:nowrap; margin-top:8px">
        <input name="watchTag" placeholder="new watch tag" required />
        <button>Add</button>
      </form>
    </div>

    <h2>Backup</h2>
    <div class="card">
      <p class="muted">Full backup (JSON). Keep a copy off this phone.</p>
      <div class="row">
        <button type="button" id="save-backup">Save backup file</button>
        <button type="button" id="share-backup">Share backup…</button>
        <button type="button" id="copy-backup">Copy backup</button>
      </div>
      <textarea id="backup-text" rows="4" readonly hidden></textarea>
      <p class="muted">Restore: pick a backup file, or paste copied backup text. Into an empty app = exact restore; otherwise merged.</p>
      <div class="row">
        <button type="button" id="import-button">Restore from file</button><input type="file" id="import-file" accept="application/json,.json,text/plain" hidden />
      </div>
      <textarea id="paste-backup" rows="2" placeholder="…or paste backup text here"></textarea>
      <button type="button" id="paste-import">Restore pasted text</button>
      <p class="muted">For spreadsheets: <button type="button" id="export-csv">Save CSV</button></p>
      <p class="muted">Free software (AGPL-3.0). Source: <a href="${SOURCE_URL}">${SOURCE_URL}</a></p>
      <p class="muted">${state.entries.length} entries stored. <span id="persist-status"></span> App version ${APP_VERSION}.</p>
      <button class="danger" id="delete-all">Delete all data</button>
    </div>
    ${debug}`;

  navigator.storage?.persisted?.().then((persisted) => {
    const status = $("#persist-status");
    if (status)
      status.textContent = persisted
        ? "Storage: protected from auto-cleanup."
        : "Storage: browser may clear it under pressure – export regularly.";
  });
}

// ---------- dose calculator ----------

// Calculator inputs, kept so switching tabs does not wipe them.
let calcPicked = []; // strain ids, at most 2, oldest first
let calcTouched = false; // until the user picks, preselect the last used product
let calcThc = "";
let calcCbd = "";
let calcPlan = []; // [{ strain, amount }] from the last successful calculation, for "Log this"
const MAX_CALC_PRODUCTS = 2;
const THC_PRESETS = [2.5, 5, 10];
const CBD_PRESETS = [5, 10, 20];

function roundToStep(strain, amount) {
  const step = FORMS[strain.form].step;
  const steps = Math.round(amount / step);
  return Number((steps * step).toFixed(2)); // toFixed drops float noise like 0.35000000000000003
}

function amountLabel(strain, amount) {
  return `${amount} ${FORMS[strain.form].amountUnit} ${esc(strain.name)}`;
}

/** Tap a product chip: select it, or unselect if already picked. A 3rd pick replaces the oldest. */
function toggleCalcProduct(strainId) {
  calcTouched = true;
  if (calcPicked.includes(strainId)) {
    calcPicked = calcPicked.filter((id) => id !== strainId);
  } else {
    calcPicked.push(strainId);
    if (calcPicked.length > MAX_CALC_PRODUCTS) calcPicked.shift();
  }
  renderCalc();
}

function renderCalc() {
  calcPicked = calcPicked.filter((id) => strainById(id)); // drop products deleted since
  if (!calcTouched && calcPicked.length === 0 && state.strains.length > 0) calcPicked = [strainsByLastUse()[0].id];
  const chips = state.strains
    .map((s) => {
      const picked = calcPicked.includes(s.id);
      return `<button type="button" class="chip pick" data-calc-product="${s.id}" aria-pressed="${picked}">${esc(s.name)}</button>`;
    })
    .join(" ");
  const presets = (field, values) =>
    values.map((mg) => `<button type="button" class="chip" data-calc-${field}="${mg}">${mg}</button>`).join(" ");
  $("#view-calc").innerHTML = `
    <h2>Dose calculator</h2>
    <p class="muted">Pick 1 product for a THC dose. Pick 2 to also set CBD.</p>
    <div class="card">
      <div class="row">${chips || `<span class="muted">Add a strain / product in Settings first.</span>`}</div>
    </div>
    <form class="card" id="calc-form">
      <label class="field"><span>THC mg</span><input name="thcMg" type="number" inputmode="decimal" step="any" min="0" value="${esc(calcThc)}" /></label>
      <div class="row">${presets("thc", THC_PRESETS)}</div>
      <label class="field"><span>CBD mg ${calcPicked.length === 2 ? "" : "(needs 2 products)"}</span><input name="cbdMg" type="number" inputmode="decimal" step="any" min="0" value="${esc(calcCbd)}" /></label>
      <div class="row">${presets("cbd", CBD_PRESETS)}</div>
    </form>
    <div class="card" id="calc-result"></div>
    <p class="muted">mg ${esc(CALC_MODES[chartMode()])}. Amounts rounded to what you can measure. A calculator, not a recommendation.</p>`;
  updateCalcResult();
}

function updateCalcResult() {
  const form = $("#calc-form");
  if (!form) return;
  calcThc = form.thcMg.value;
  calcCbd = form.cbdMg.value;
  calcPlan = [];
  try {
    $("#calc-result").innerHTML = calcResultHtml();
  } catch (error) {
    // Never leave the card silently empty (that looked "broken" before).
    console.error(error);
    $("#calc-result").innerHTML = `<div class="worse">${esc(error.message)}</div>`;
  }
}

/** THC/CBD mg the rounded amounts in calcPlan really contain (can differ slightly from the target). */
function planTotalsText() {
  let thc = 0;
  let cbd = 0;
  for (const part of calcPlan) {
    const perUnit = mgPerUnit(part.strain, chartMode());
    thc += perUnit.thc * part.amount;
    cbd += perUnit.cbd * part.amount;
  }
  return `→ ${round1(thc)} mg THC · ${round1(cbd)} mg CBD (${ratioText(thc, cbd)})`;
}

/** Text for the result card. Also fills calcPlan when there is something to log. */
function calcResultHtml() {
  const strains = calcPicked.map(strainById);
  if (strains.length === 0) return `<span class="muted">Tap a product above.</span>`;
  const thcMg = calcThc === "" ? 0 : Number(calcThc);
  const cbdMg = calcCbd === "" ? Number.NaN : Number(calcCbd); // empty CBD with 2 products = not entered yet
  const cbdForOne = Number.isNaN(cbdMg) ? 0 : cbdMg;
  const plan = planForMg(strains, thcMg, strains.length === 1 ? cbdForOne : cbdMg, chartMode());

  if (plan.error) {
    const possible = plan.possible
      ? `<div class="muted">These two can make THC:CBD between ${ratioText(plan.possible[0].thc, plan.possible[0].cbd)} and ${ratioText(plan.possible[1].thc, plan.possible[1].cbd)}.</div>`
      : "";
    return `<div class="worse">${esc(plan.error)}</div>${possible}`;
  }
  calcPlan = plan.parts
    .map((part) => ({ strain: part.strain, amount: roundToStep(part.strain, part.amount) }))
    .filter((part) => part.amount > 0);
  if (calcPlan.length === 0) return `<span class="muted">Amount rounds to 0. Enter a larger dose.</span>`;
  const lines = calcPlan.map((part, i) => `<div class="big">${i > 0 ? "+ " : ""}${amountLabel(part.strain, part.amount)}</div>`);
  return `${lines.join("")}
    <div>${planTotalsText()}</div>
    <button type="button" class="primary" id="calc-log">Log this</button>`;
}

/** Preset chip: put the value in the field and recalculate. */
function setCalcField(name, value) {
  $("#calc-form")[name].value = value;
  updateCalcResult();
}

/** Log the calculated amounts as entries now (one per product). Undo-able; edit them on the Day view. */
function logCalcPlan() {
  const now = new Date().toISOString();
  const added = calcPlan.map((part) => ({
    id: newId(),
    t: now,
    strain: { ...part.strain },
    amount: part.amount,
    route: FORMS[part.strain.form].defaultRoute,
    note: "",
    scores: {},
    effects: [],
    watch: [],
  }));
  for (const entry of added) validateEntry(entry);
  state.entries.push(...added);
  shownDay = dayKey(now);
  view = "day";
  commit();
  toast(`Logged ${added.length} ${added.length === 1 ? "entry" : "entries"}`, () => {
    const addedIds = new Set(added.map((e) => e.id));
    state.entries = state.entries.filter((e) => !addedIds.has(e.id));
    commit();
  });
}

// ---------- entry dialog ----------

let editingEntry = null; // the entry being edited, or null for a new one
let draftScores = {};
let draftAfter = null; // { t, scores } or null: how it felt later (D30)
let draftEffects = [];
let draftWatch = []; // watch tag names
let draftContext = []; // [{ tag, value }] medication, habits

/** Dose fields only make sense when something was taken. */
function isNoDoseChecked() {
  return $("#entry-form").noDose.checked;
}

function updateDoseFields() {
  const form = $("#entry-form");
  // A sip has no product of its own: it is one use of a load, so only time, scores, tags and note are editable.
  const sip = editingSip();
  $("#no-dose-row").hidden = sip;
  $("#sip-info").hidden = !sip;
  if (sip) {
    const load = state.entries.find((e) => e.id === editingEntry.sipOf);
    $("#sip-info").textContent = `One use of the ${load.strain.name} load (${amountText(load)}).`;
  }
  const noDose = isNoDoseChecked() || sip;
  $("#dose-fields").hidden = noDose;
  $("#entry-after").hidden = isNoDoseChecked() && !sip; // after ratings only belong to a dose
  form.amount.required = !noDose; // hidden required fields would block saving
  updateEntryPreview();
}

function strainsByLastUse() {
  const lastUse = {};
  for (const entry of state.entries) {
    if (!isDose(entry) || isSip(entry)) continue; // no product of their own
    const id = entry.strain.id;
    if (!lastUse[id] || entry.t > lastUse[id]) lastUse[id] = entry.t;
  }
  return [...state.strains].sort((a, b) => (lastUse[b.id] ?? "").localeCompare(lastUse[a.id] ?? ""));
}

/**
 * The strain picked in the entry form.
 * Editing an entry with the same strain keeps its old snapshot, so changing a strain's label later never rewrites history.
 */
function selectedStrain() {
  const id = $("#entry-form").strainId.value;
  if (editingEntry?.strain && editingEntry.strain.id === id) return editingEntry.strain;
  return strainById(id);
}

function localInputTime(date) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultEntryTime() {
  if (shownDay === dayKey(new Date())) return new Date();
  return new Date(dayStart(shownDay).getTime() + 12 * 3600 * 1000); // past day: noon
}

function openEntryDialog(entry, { focusAfter = false } = {}) {
  const form = $("#entry-form");
  editingEntry = entry;
  draftScores = { ...(entry?.scores ?? {}) };
  draftAfter = entry?.after ? { t: entry.after.t, scores: { ...entry.after.scores } } : null;
  draftEffects = [...(entry?.effects ?? [])];
  draftWatch = [...(entry?.watch ?? [])];
  draftContext = (entry?.context ?? []).map((item) => ({ ...item }));
  // No products yet: only a no-dose entry (craving, event) is possible.
  form.noDose.checked = (entry && !isDose(entry)) || state.strains.length === 0;

  const options = strainsByLastUse().map((s) => `<option value="${s.id}">${esc(s.name)}</option>`);
  // The entry's strain may have been deleted since; keep it selectable from the snapshot.
  if (entry?.strain && !strainById(entry.strain.id)) {
    options.unshift(`<option value="${entry.strain.id}">${esc(entry.strain.name)} (deleted)</option>`);
  }
  form.strainId.innerHTML = options.join("");
  if (entry?.strain) form.strainId.value = entry.strain.id;

  form.amount.value = entry?.amount ?? "";
  form.route.value = entry?.route ?? defaultRoute();
  form.isLoad.checked = Boolean(entry?.load);
  form.loadOpen.checked = Boolean(entry?.load?.open);
  $("#load-open-field").hidden = !entry?.load; // only when editing an existing load
  form.time.value = localInputTime(entry ? new Date(entry.t) : defaultEntryTime());
  form.note.value = entry?.note ?? "";
  $("#entry-title").textContent = entry ? "Edit entry" : "New entry";
  $("#entry-delete").hidden = !entry;
  renderEntryChoices();
  updateDoseFields();
  $("#entry-dialog").showModal();
  if (focusAfter) $("#entry-after").scrollIntoView({ block: "start" });
}

function editingSip() {
  return Boolean(editingEntry && isSip(editingEntry));
}

function defaultRoute() {
  const strain = selectedStrain();
  if (!strain) return "inhaled";
  return FORMS[strain.form].defaultRoute;
}

/**
 * 0–10 buttons per symptom. `attribute` tells the click handler which set they belong to:
 * "data-score" = before / at dose, "data-after-score" = later (D30).
 */
function scoreGrid(scores, attribute) {
  return state.settings.symptoms
    .map((s) => {
      const buttons = [];
      for (let value = 0; value <= 10; value++) {
        const pressed = scores[s.name] === value;
        const style = `background:${scoreColor(value, s.higherIsBetter)}`;
        buttons.push(
          `<button type="button" ${attribute}="${esc(s.name)}" data-value="${value}" aria-pressed="${pressed}" style="${style}">${value}</button>`,
        );
      }
      const hint = s.higherIsBetter ? "10 = best" : "10 = worst";
      return `<div class="field"><span class="muted">${esc(s.name)} (${hint}, tap again to clear)</span><div class="scores">${buttons.join("")}</div></div>`;
    })
    .join("");
}

function renderEntryChoices() {
  $("#entry-scores").innerHTML = scoreGrid(draftScores, "data-score");
  let ratedAt = "";
  if (draftAfter) ratedAt = ` · rated ${new Date(draftAfter.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  $("#entry-after-title").textContent = `How you feel after (optional)${ratedAt}`;
  $("#entry-after-scores").innerHTML = scoreGrid(draftAfter?.scores ?? {}, "data-after-score");

  $("#entry-effects").innerHTML = state.settings.effectTags
    .map((t) => {
      const pressed = draftEffects.some((e) => e.tag === t.tag);
      const sign = t.good ? "+" : "−";
      return `<button type="button" class="chip ${t.good ? "good" : "bad"}" data-effect="${esc(t.tag)}" aria-pressed="${pressed}">${sign} ${esc(t.tag)}</button>`;
    })
    .join(" ");

  $("#entry-watch").innerHTML = watchTagsOf(state.settings)
    .map((t) => {
      const pressed = draftWatch.includes(t.tag);
      return `<button type="button" class="chip watch" data-watch="${esc(t.tag)}" aria-pressed="${pressed}">${esc(t.tag)}</button>`;
    })
    .join(" ");

  renderContextChoices();
}

/** Context chips; selected tags that have a unit get a number field (e.g. medication 20 mg). */
function renderContextChoices() {
  const tags = contextTagsOf(state.settings);
  const chips = tags.map((t) => {
    const pressed = draftContext.some((item) => item.tag === t.tag);
    return `<button type="button" class="chip context" data-context="${esc(t.tag)}" aria-pressed="${pressed}">${esc(t.tag)}</button>`;
  });
  const fields = draftContext
    .map((item) => {
      const unit = tags.find((t) => t.tag === item.tag)?.unit ?? "";
      if (!unit) return "";
      return `<label class="row" style="flex-wrap:nowrap"><span style="min-width:40%">${esc(item.tag)} (${unit === "x" ? "count" : unit})</span>
        <input type="number" inputmode="decimal" step="any" min="0" data-context-value="${esc(item.tag)}" value="${item.value ?? ""}" /></label>`;
    })
    .join("");
  $("#entry-context").innerHTML = `<div class="row">${chips.join(" ")}</div>${fields}`;
}

/** Number typed next to a selected context tag. Empty = no value. */
function onContextValueInput(event) {
  const tag = event.target.dataset?.contextValue;
  if (!tag) return;
  const item = draftContext.find((i) => i.tag === tag);
  const text = event.target.value.trim();
  item.value = text === "" ? null : Number(text);
}

function readEntryForm() {
  const form = $("#entry-form");
  const common = {
    id: editingEntry?.id ?? newId(),
    t: new Date(form.time.value).toISOString(),
    note: form.note.value.trim(),
    scores: { ...draftScores },
    effects: [...draftEffects],
    watch: [...draftWatch],
    context: draftContext.map((item) => ({ ...item })),
  };
  if (draftAfter) common.after = { t: draftAfter.t, scores: { ...draftAfter.scores } };
  if (editingSip()) return { ...common, sipOf: editingEntry.sipOf };
  if (isNoDoseChecked()) {
    delete common.after; // no dose, nothing to rate "after"
    return { ...common, noDose: true };
  }
  const strain = selectedStrain();
  if (!strain) throw new Error("Pick a strain / product, or tick 'No dose'.");
  const dose = {
    ...common,
    strain: { ...strain }, // copy: the entry keeps the label values it was logged with
    amount: Number(form.amount.value),
    route: form.route.value,
  };
  if (form.isLoad.checked) dose.load = readLoadField(form);
  return dose;
}

/**
 * New loads start open. Editing: the "still open" box decides.
 * Old closed loads may carry a guessed fraction (¾, ½, ¼) from an earlier version; keep it unless reopened.
 */
function readLoadField(form) {
  if (!editingEntry?.load) return { open: true, used: 1 };
  const open = form.loadOpen.checked;
  if (open) return { open: true, used: 1 };
  return { open: false, used: editingEntry.load.used };
}

function updateEntryPreview() {
  const form = $("#entry-form");
  const strain = selectedStrain();
  if (strain) $("#amount-label").textContent = `Amount (${FORMS[strain.form].amountUnit})`;
  const amount = Number(form.amount.value);
  if (isNoDoseChecked() || !strain || !(amount > 0) || !form.time.value) {
    $("#entry-preview").textContent = "";
    return;
  }
  const active = activeMg(readEntryForm(), mode());
  const ratio = ratioText(active.thc[1], active.cbd[1]);
  $("#entry-preview").textContent =
    `= ${rangeText(active.thc)} mg THC · ${rangeText(active.cbd)} mg CBD (${CALC_MODES[mode()]}) · ${ratio}`;
}

function saveEntryFromDialog() {
  const entry = readEntryForm();
  validateEntry(entry); // throws with a readable message; caller keeps the dialog open
  state.entries = state.entries.filter((e) => e.id !== entry.id).concat(entry);
  shownDay = dayKey(entry.t);
  commit();
}

/** Delete an entry. A load takes its sips with it (they make no sense alone). One Undo brings all back. */
function deleteEntry(entry) {
  const removed = state.entries.filter((e) => e.id === entry.id || e.sipOf === entry.id);
  const removedIds = new Set(removed.map((e) => e.id));
  state.entries = state.entries.filter((e) => !removedIds.has(e.id));
  commit();
  const sipCount = removed.length - 1;
  toast(sipCount > 0 ? `Load and ${sipCount} sips deleted` : "Entry deleted", () => {
    state.entries.push(...removed);
    commit();
  });
}

// ---------- strain dialog ----------

let editingStrain = null;

function openStrainDialog(strain) {
  const form = $("#strain-form");
  editingStrain = strain;
  form.strainName.value = strain?.name ?? "";
  form.strainForm.value = strain?.form ?? "flower";
  form.thc.value = strain?.thc ?? "";
  form.cbd.value = strain?.cbd ?? "";
  form.acid.checked = strain?.acid ?? false;
  $("#strain-delete").hidden = !strain;
  updateStrainLabels();
  $("#strain-dialog").showModal();
}

function updateStrainLabels() {
  const unit = FORMS[$("#strain-form").strainForm.value].strengthUnit;
  $("#thc-label").textContent = `THC (${unit})`;
  $("#cbd-label").textContent = `CBD (${unit})`;
}

function saveStrainFromDialog() {
  const form = $("#strain-form");
  const strain = {
    id: editingStrain?.id ?? newId(),
    name: form.strainName.value.trim(),
    form: form.strainForm.value,
    thc: Number(form.thc.value),
    cbd: Number(form.cbd.value),
    acid: form.acid.checked,
  };
  validateStrain(strain); // throws with a readable message; caller keeps the dialog open
  state.strains = state.strains.filter((s) => s.id !== strain.id).concat(strain);
  commit();
}

function deleteStrain(strain) {
  state.strains = state.strains.filter((s) => s.id !== strain.id);
  commit();
  toast(`"${strain.name}" deleted (past entries keep it)`, () => {
    state.strains.push(strain);
    commit();
  });
}

// ---------- events ----------

/**
 * Dialog forms: on "save", run `saveAction`. If it throws, show why and keep the dialog open (no data lost).
 */
function onDialogSave(form, saveAction) {
  form.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save") return;
    try {
      saveAction();
    } catch (error) {
      event.preventDefault();
      console.error(error);
      alert(error.message);
    }
  });
}

/** Buttons and rows inside the views. Views are re-rendered, so clicks are delegated from <main>. */
function onViewClick(event) {
  const target = event.target.closest("button, [data-id], [data-strain], [data-goto-day]");
  if (!target) return;
  const data = target.dataset;

  if (data.sip) return addSip(data.sip);
  if (data.emptyLoad) return closeLoad(data.emptyLoad);
  if (data.skipAfter) return skipAfterRating(data.skipAfter);
  if (data.rateAfter)
    return openEntryDialog(
      state.entries.find((e) => e.id === data.rateAfter),
      { focusAfter: true },
    );
  if (data.day === "today") shownDay = dayKey(new Date());
  else if (data.day) shownDay = addDays(shownDay, Number(data.day));
  else if (data.week) shownWeek = addDays(shownWeek, 7 * Number(data.week));
  else if (data.range) trendDays = Number(data.range);
  else if (data.gotoDay) {
    shownDay = data.gotoDay;
    view = "day";
  } else if (data.symptomRemove) state.settings.symptoms.splice(Number(data.symptomRemove), 1);
  else if (data.tagRemove) state.settings.effectTags.splice(Number(data.tagRemove), 1);
  else if (data.contextRemove) {
    state.settings.contextTags = contextTagsOf(state.settings); // older data: start from the defaults
    state.settings.contextTags.splice(Number(data.contextRemove), 1);
  } else if (data.watchRemove) {
    state.settings.watchTags = watchTagsOf(state.settings); // older data: start from the defaults
    state.settings.watchTags.splice(Number(data.watchRemove), 1);
  } else if (data.id) return openEntryDialog(state.entries.find((e) => e.id === data.id));
  else if (data.strain) return openStrainDialog(strainById(data.strain));
  else if (target.id === "strain-add") return openStrainDialog(null);
  else if (target.id === "calc-log") return logCalcPlan();
  else if (data.report) return printDoctorReport();
  else if (data.calcProduct) return toggleCalcProduct(data.calcProduct);
  else if (data.calcThc) return setCalcField("thcMg", data.calcThc);
  else if (data.calcCbd) return setCalcField("cbdMg", data.calcCbd);
  else if (target.id === "save-backup") return saveFile(backupFilename("json"), toJson(state), "application/json");
  else if (target.id === "share-backup") return shareFile(backupFilename("json"), toJson(state));
  else if (target.id === "copy-backup") return copyBackup();
  else if (target.id === "paste-import") return importText($("#paste-backup").value);
  else if (target.id === "export-csv") return saveFile(backupFilename("csv"), toCsv(state), "text/csv");
  else if (target.id === "import-button") return $("#import-file").click();
  else if (target.id === "delete-all") return deleteAll();
  else return;

  commit(); // the branches above that fall through changed state or navigation
}

function onViewChange(event) {
  const input = event.target;
  if (input.name === "calc-mode") {
    state.settings.calcMode = input.value;
    commit();
  } else if (input.dataset.symptomDir) {
    state.settings.symptoms[Number(input.dataset.symptomDir)].higherIsBetter = input.checked;
    commit();
  } else if (input.id === "import-file") {
    importFile(input.files[0]);
  }
}

function onViewSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.id === "symptom-form") {
    const name = form.symptomName.value.trim();
    if (state.settings.symptoms.some((s) => s.name === name)) return alert(`"${name}" already exists`);
    state.settings.symptoms.push({ name, higherIsBetter: false });
  }
  if (form.id === "limit-form") {
    const text = form.dailyLimit.value.trim();
    const limit = Number(text);
    if (text === "") state.settings.dailyLimitMg = null;
    else if (limit > 0) state.settings.dailyLimitMg = limit;
    else return alert(`Ceiling ${text} must be a number > 0, or empty for off`);
  }
  if (form.id === "context-form") {
    const tag = form.contextTag.value.trim();
    state.settings.contextTags = contextTagsOf(state.settings); // older data: start from the defaults
    if (state.settings.contextTags.some((t) => t.tag === tag)) return alert(`"${tag}" already exists`);
    state.settings.contextTags.push({ tag, kind: form.kind.value, unit: form.unit.value });
  }
  if (form.id === "watch-form") {
    const tag = form.watchTag.value.trim();
    state.settings.watchTags = watchTagsOf(state.settings); // older data: start from the defaults
    if (state.settings.watchTags.some((t) => t.tag === tag)) return alert(`"${tag}" already exists`);
    state.settings.watchTags.push({ tag });
  }
  if (form.id === "tag-form") {
    const tag = form.tag.value.trim();
    if (state.settings.effectTags.some((t) => t.tag === tag)) return alert(`"${tag}" already exists`);
    state.settings.effectTags.push({ tag, good: form.good.value === "true" });
  }
  commit();
}

/** Score buttons and effect chips in the entry dialog. */
function onEntryChoiceClick(event) {
  const button = event.target.closest(
    "button[data-score], button[data-after-score], button[data-effect], button[data-watch], button[data-context]",
  );
  if (!button) return;
  const { score, afterScore, value, effect, watch, context } = button.dataset;
  if (afterScore) toggleAfterScore(afterScore, Number(value));
  if (context) {
    const alreadyOn = draftContext.some((item) => item.tag === context);
    if (alreadyOn) draftContext = draftContext.filter((item) => item.tag !== context);
    else draftContext.push({ tag: context, value: null });
  }
  if (watch) {
    if (draftWatch.includes(watch)) draftWatch = draftWatch.filter((tag) => tag !== watch);
    else draftWatch.push(watch);
  }
  if (score) {
    if (draftScores[score] === Number(value)) delete draftScores[score];
    else draftScores[score] = Number(value);
  }
  if (effect) {
    const alreadyOn = draftEffects.some((e) => e.tag === effect);
    if (alreadyOn) draftEffects = draftEffects.filter((e) => e.tag !== effect);
    else draftEffects.push({ ...state.settings.effectTags.find((t) => t.tag === effect) });
  }
  renderEntryChoices();
}

/** First after-score sets the rating time to now. Clearing the last one removes "after" again. */
function toggleAfterScore(name, value) {
  if (!draftAfter) draftAfter = { t: new Date().toISOString(), scores: {} };
  if (draftAfter.scores[name] === value) delete draftAfter.scores[name];
  else draftAfter.scores[name] = value;
  const wasSkipped = editingEntry?.after && Object.keys(editingEntry.after.scores).length === 0;
  if (Object.keys(draftAfter.scores).length === 0 && !wasSkipped) draftAfter = null;
}

function wireEvents() {
  for (const button of document.querySelectorAll("nav [data-view]")) {
    button.onclick = () => {
      view = button.dataset.view;
      render();
    };
  }
  $("#add-entry").onclick = () => openEntryDialog(null);
  $("#theme-toggle").onclick = nextTheme;
  // In "auto", the phone switching light/dark must redraw charts (they copy colors at draw time).
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  window.addEventListener("resize", () => {
    if (view === "trends") renderTrends();
  });

  const main = document.querySelector("main");
  main.addEventListener("click", onViewClick);
  main.addEventListener("change", onViewChange);
  main.addEventListener("submit", onViewSubmit);
  main.addEventListener("input", (event) => {
    if (event.target.closest("#calc-form")) updateCalcResult();
  });

  const entryForm = $("#entry-form");
  entryForm.addEventListener("click", onEntryChoiceClick);
  entryForm.addEventListener("input", updateEntryPreview);
  entryForm.addEventListener("input", onContextValueInput);
  entryForm.strainId.addEventListener("change", () => {
    entryForm.route.value = defaultRoute();
    updateEntryPreview();
  });
  entryForm.noDose.addEventListener("change", updateDoseFields);
  onDialogSave(entryForm, saveEntryFromDialog);
  $("#entry-delete").onclick = () => {
    $("#entry-dialog").close();
    deleteEntry(editingEntry);
  };

  const strainForm = $("#strain-form");
  strainForm.strainForm.addEventListener("change", updateStrainLabels);
  onDialogSave(strainForm, saveStrainFromDialog);
  $("#strain-delete").onclick = () => {
    $("#strain-dialog").close();
    deleteStrain(editingStrain);
  };
}

async function importFile(file) {
  if (!file) return;
  importText(await file.text());
}

/** Restore/merge a backup given as JSON text (from a file or pasted). */
function importText(text) {
  if (text.trim() === "") return alert("Nothing to restore: the text is empty.");
  try {
    const backup = fromJson(text);
    state = merge(state, backup);
    commit();
    alert(`Imported ${backup.entries.length} entries and ${backup.strains.length} strains.`);
  } catch (error) {
    alert(`Import failed, nothing changed.\n${error.message}`);
  }
}

function deleteAll() {
  if (!confirm("Delete ALL entries and strains on this device? Export a backup first.")) return;
  state = emptyState();
  commit();
}

// ---------- start ----------

function start() {
  try {
    state = load();
  } catch (error) {
    // Saved data is broken: do NOT overwrite it. Show the error and offer the raw text for rescue.
    const box = $("#load-error");
    box.hidden = false;
    box.innerHTML = `Saved data could not be read: ${esc(error.message)}<br>Nothing was changed. Raw data (copy it somewhere safe):<pre>${esc(localStorage.getItem(STORAGE_KEY))}</pre>`;
    return;
  }
  wireEvents();
  render();
  navigator.storage?.persist?.(); // ask the browser not to auto-clear our data
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
}

window.cannalog = {
  dump: () => console.log(JSON.parse(JSON.stringify(state))),
  get state() {
    return state;
  },
};

start();

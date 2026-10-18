// DOM only. All math lives in calc.js, all data rules in store.js.
// Debug: open the console and run cannalog.dump(), or add ?debug to the URL.

import {
  activeMg,
  addDays,
  CALC_MODES,
  dayKey,
  dayRange,
  dayStart,
  entriesBetween,
  goodness,
  groupByDay,
  rangeText,
  ratioText,
  rollingAverage,
  round1,
  summarize,
  thcShare,
  trend,
  weekStart,
} from "./calc.js";
import {
  emptyState,
  FORMS,
  fromJson,
  load,
  merge,
  newId,
  STORAGE_KEY,
  save,
  toCsv,
  toJson,
  validateEntry,
  validateStrain,
} from "./store.js";

const $ = (selector) => document.querySelector(selector);
const UNDO_SECONDS = 6;
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

const ARROWS = { better: "▲", worse: "▼", same: "=", none: "" };

function trendSpan(now, before, higherIsBetter, threshold) {
  const direction = trend(now, before, higherIsBetter, threshold);
  return `<span class="${direction}" title="vs previous week">${ARROWS[direction]}</span>`;
}

function effectChips(effects) {
  return effects.map((e) => `<span class="chip ${e.good ? "good" : "bad"}">${esc(e.tag)}</span>`).join(" ");
}

function download(filename, text, type) {
  const file = new File([text], filename, { type });
  // On phones the share sheet lets you save straight to Files/Drive/etc.
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => {}); // user cancelled: nothing to do
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

let undoTimer;
function toast(text, onUndo) {
  $("#toast-text").textContent = text;
  $("#toast").hidden = false;
  $("#toast-undo").onclick = () => {
    $("#toast").hidden = true;
    onUndo();
  };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, UNDO_SECONDS * 1000);
}

// ---------- views ----------

function render() {
  for (const name of ["day", "week", "trends", "settings"]) {
    $(`#view-${name}`).hidden = name !== view;
    $(`nav [data-view="${name}"]`).toggleAttribute("aria-current", name === view);
  }
  $("#add-entry").hidden = view === "settings";
  $("#mode-badge").textContent = `mg = ${CALC_MODES[mode()]}`;
  if (view === "day") renderDay();
  if (view === "week") renderWeek();
  if (view === "trends") renderTrends();
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
    <div class="row spread muted"><span>ratio THC:CBD ${ratio}</span><span>${summary.count} uses</span></div>
    <div class="row">${scores}</div>
  </div>`;
}

function renderDay() {
  const entries = groupByDay(state.entries)[shownDay] ?? [];
  const label = shownDay === dayKey(new Date()) ? "Today" : dayStart(shownDay).toDateString();

  // Running total: what the day adds up to after each entry.
  let runningThc = [0, 0];
  let runningCbd = [0, 0];
  const items = entries.map((entry) => {
    const active = activeMg(entry, mode());
    runningThc = [runningThc[0] + active.thc[0], runningThc[1] + active.thc[1]];
    runningCbd = [runningCbd[0] + active.cbd[0], runningCbd[1] + active.cbd[1]];
    const time = new Date(entry.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const scores = Object.entries(entry.scores)
      .map(([name, value]) => `${esc(name)} ${value}`)
      .join(" · ");
    return `<div class="card entry" data-id="${entry.id}">
      <div class="row spread"><b>${time} ${esc(entry.strain.name)}</b><span class="muted">${amountText(entry)} ${entry.route}</span></div>
      <div class="row spread">
        <span><span class="thc">${rangeText(active.thc)}</span> / <span class="cbd">${rangeText(active.cbd)}</span> mg</span>
        <span class="muted">day: ${rangeText(runningThc)} / ${rangeText(runningCbd)} mg</span>
      </div>
      ${scores ? `<div class="muted">${scores}</div>` : ""}
      ${entry.effects.length ? `<div class="row">${effectChips(entry.effects)}</div>` : ""}
      ${entry.note ? `<div>📝 ${esc(entry.note)}</div>` : ""}
    </div>`;
  });

  $("#view-day").innerHTML = `
    <div class="row spread">
      <button data-day="-1" aria-label="Previous day">‹</button>
      <b>${esc(label)}</b>
      <button data-day="1" aria-label="Next day">›</button>
    </div>
    ${summaryCard(summarize(entries, mode()))}
    ${items.join("") || `<p class="muted">Nothing logged. Tap + to add.</p>`}
    ${shownDay !== dayKey(new Date()) ? `<button data-day="today">Back to today</button>` : ""}`;
}

function renderWeek() {
  const lastDay = addDays(shownWeek, 6);
  const thisWeek = summarize(entriesBetween(state.entries, shownWeek, lastDay), mode());
  const prevWeek = summarize(entriesBetween(state.entries, addDays(shownWeek, -7), addDays(shownWeek, -1)), mode());
  const byDay = groupByDay(state.entries);
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
      <td>${day.count ? ratioText(day.thc[1], day.cbd[1]) : ""}</td>
      ${symptoms.map((s) => scoreCell(day, s)).join("")}
    </tr>`;
  });

  const totalRow = `<tr>
    <th>Week</th>
    <th class="thc">${round1(thisWeek.thc[1])}</th>
    <th class="cbd">${round1(thisWeek.cbd[1])}</th>
    <th>${ratioText(thisWeek.thc[1], thisWeek.cbd[1])}</th>
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

  const notes = entriesBetween(state.entries, shownWeek, lastDay)
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
        <thead><tr><th></th><th class="thc">THC</th><th class="cbd">CBD</th><th>ratio</th>${symptoms.map((s) => `<th>${esc(s.name)}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("")}</tbody>
        <tfoot>${totalRow}</tfoot>
      </table>
      <p class="muted">mg ${esc(CALC_MODES[mode()])}${mode() === "absorbed" ? " (upper end)" : ""}. Score colors: green = good, red = bad. ▲▼ vs previous week.</p>
    </div>
    <h2>Effects</h2>
    <div class="card">${effectRows.join("") || `<span class="muted">none logged</span>`}</div>
    <h2>Notes</h2>
    <div class="card">${notes.join("") || `<span class="muted">none</span>`}</div>`;
}

function renderTrends() {
  for (const chart of charts) chart.destroy();
  charts = [];

  // Absorbed is a wide range; a single bar would look precise. Charts use decarb mg instead (docs/formulas.md).
  const chartMode = mode() === "absorbed" ? "decarb" : mode();
  const today = dayKey(new Date());
  const keys = dayRange(addDays(today, -(trendDays - 1)), today);
  const byDay = groupByDay(state.entries);
  const days = keys.map((key) => summarize(byDay[key] ?? [], chartMode));
  const x = keys.map((key) => dayStart(key).getTime() / 1000);
  const thc = days.map((d) => (d.count ? d.thc[1] : null));
  const cbd = days.map((d) => (d.count ? d.cbd[1] : null));
  const share = days.map((d) => thcShare(d.thc[1], d.cbd[1]));
  const symptoms = state.settings.symptoms;
  const symptomLines = symptoms.map((s) =>
    rollingAverage(
      days.map((d) => d.scores[s.name] ?? null),
      TREND_WINDOW_DAYS,
    ),
  );

  $("#view-trends").innerHTML = `
    <div class="row">${[7, 30, 90].map((n) => `<button data-range="${n}" ${n === trendDays ? 'class="primary"' : ""}>${n} d</button>`).join("")}</div>
    <h2>Consumption (mg ${esc(CALC_MODES[chartMode])}) and THC share</h2>
    <div class="card"><div id="chart-mg" class="chart"></div></div>
    <h2>Symptoms (${TREND_WINDOW_DAYS}-day average, 0–10)</h2>
    <div class="card"><div id="chart-scores" class="chart"></div></div>
    <h2>Notes <span class="muted" id="notes-day">(tap a day on a chart)</span></h2>
    <div class="card" id="notes-list"><span class="muted">–</span></div>`;

  const width = $("#chart-mg").clientWidth;
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const axis = { stroke: color("--muted"), grid: { stroke: color("--line") }, ticks: { stroke: color("--line") } };
  const bars = (align) => uPlot.paths.bars({ size: [0.4, 40], align });

  // Show notes of the day under the cursor, so mood text sits next to the numbers.
  const showNotes = (u) => {
    const index = u.cursor.idx;
    if (index == null) return;
    const key = keys[index];
    const notes = (byDay[key] ?? []).filter((e) => e.note);
    $("#notes-day").textContent = dayStart(key).toDateString();
    $("#notes-list").innerHTML =
      notes.map((e) => `<div>${esc(e.strain.name)}: ${esc(e.note)}</div>`).join("") || `<span class="muted">no notes</span>`;
  };
  const cursor = { sync: { key: "cannalog" } };
  const hooks = { setCursor: [showNotes] };

  charts.push(
    new uPlot(
      {
        width,
        height: 220,
        cursor,
        hooks,
        scales: { x: { time: true }, share: { range: [0, 100] } },
        axes: [axis, { ...axis, label: "mg" }, { ...axis, scale: "share", side: 1, grid: { show: false }, label: "THC %" }],
        series: [
          {},
          { label: "THC mg", stroke: color("--thc"), fill: color("--thc"), paths: bars(-1), points: { show: false } },
          { label: "CBD mg", stroke: color("--cbd"), fill: color("--cbd"), paths: bars(1), points: { show: false } },
          { label: "THC %", stroke: "#f08c00", scale: "share", width: 2, spanGaps: true },
        ],
      },
      [x, thc, cbd, share],
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
            width: 2,
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

    <h2>Backup</h2>
    <div class="card">
      <div class="row">
        <button id="export-json">Export JSON</button>
        <button id="export-csv">Export CSV</button>
        <label class="row"><button type="button" id="import-button">Import JSON</button><input type="file" id="import-file" accept="application/json,.json" hidden /></label>
      </div>
      <p class="muted">JSON = full backup (import merges by id). CSV = for spreadsheets. ${state.entries.length} entries stored. <span id="persist-status"></span></p>
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

// ---------- entry dialog ----------

let editingEntry = null; // the entry being edited, or null for a new one
let draftScores = {};
let draftEffects = [];

function strainsByLastUse() {
  const lastUse = {};
  for (const entry of state.entries) {
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
  if (editingEntry && editingEntry.strain.id === id) return editingEntry.strain;
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

function openEntryDialog(entry) {
  if (!state.strains.length && !entry) {
    alert("Add a strain or product first.");
    openStrainDialog(null);
    return;
  }
  const form = $("#entry-form");
  editingEntry = entry;
  draftScores = { ...(entry?.scores ?? {}) };
  draftEffects = [...(entry?.effects ?? [])];

  const options = strainsByLastUse().map((s) => `<option value="${s.id}">${esc(s.name)}</option>`);
  // The entry's strain may have been deleted since; keep it selectable from the snapshot.
  if (entry && !strainById(entry.strain.id)) {
    options.unshift(`<option value="${entry.strain.id}">${esc(entry.strain.name)} (deleted)</option>`);
  }
  form.strainId.innerHTML = options.join("");
  if (entry) form.strainId.value = entry.strain.id;

  form.amount.value = entry?.amount ?? "";
  form.route.value = entry?.route ?? FORMS[selectedStrain().form].defaultRoute;
  form.time.value = localInputTime(entry ? new Date(entry.t) : defaultEntryTime());
  form.note.value = entry?.note ?? "";
  $("#entry-title").textContent = entry ? "Edit entry" : "New entry";
  $("#entry-delete").hidden = !entry;
  renderEntryChoices();
  updateEntryPreview();
  $("#entry-dialog").showModal();
}

function renderEntryChoices() {
  $("#entry-scores").innerHTML = state.settings.symptoms
    .map((s) => {
      const buttons = [];
      for (let value = 0; value <= 10; value++) {
        const pressed = draftScores[s.name] === value;
        const style = `background:${scoreColor(value, s.higherIsBetter)}`;
        buttons.push(
          `<button type="button" data-score="${esc(s.name)}" data-value="${value}" aria-pressed="${pressed}" style="${style}">${value}</button>`,
        );
      }
      const hint = s.higherIsBetter ? "10 = best" : "10 = worst";
      return `<div class="field"><span class="muted">${esc(s.name)} (${hint}, tap again to clear)</span><div class="scores">${buttons.join("")}</div></div>`;
    })
    .join("");

  $("#entry-effects").innerHTML = state.settings.effectTags
    .map((t) => {
      const pressed = draftEffects.some((e) => e.tag === t.tag);
      const sign = t.good ? "+" : "−";
      return `<button type="button" class="chip ${t.good ? "good" : "bad"}" data-effect="${esc(t.tag)}" aria-pressed="${pressed}">${sign} ${esc(t.tag)}</button>`;
    })
    .join(" ");
}

function readEntryForm() {
  const form = $("#entry-form");
  return {
    id: editingEntry?.id ?? newId(),
    t: new Date(form.time.value).toISOString(),
    strain: { ...selectedStrain() }, // copy: the entry keeps the label values it was logged with
    amount: Number(form.amount.value),
    route: form.route.value,
    note: form.note.value.trim(),
    scores: { ...draftScores },
    effects: [...draftEffects],
  };
}

function updateEntryPreview() {
  const form = $("#entry-form");
  $("#amount-label").textContent = `Amount (${FORMS[selectedStrain().form].amountUnit})`;
  const amount = Number(form.amount.value);
  if (!(amount > 0) || !form.time.value) {
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

function deleteEntry(entry) {
  state.entries = state.entries.filter((e) => e.id !== entry.id);
  commit();
  toast("Entry deleted", () => {
    state.entries.push(entry);
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

  if (data.day === "today") shownDay = dayKey(new Date());
  else if (data.day) shownDay = addDays(shownDay, Number(data.day));
  else if (data.week) shownWeek = addDays(shownWeek, 7 * Number(data.week));
  else if (data.range) trendDays = Number(data.range);
  else if (data.gotoDay) {
    shownDay = data.gotoDay;
    view = "day";
  } else if (data.symptomRemove) state.settings.symptoms.splice(Number(data.symptomRemove), 1);
  else if (data.tagRemove) state.settings.effectTags.splice(Number(data.tagRemove), 1);
  else if (data.id) return openEntryDialog(state.entries.find((e) => e.id === data.id));
  else if (data.strain) return openStrainDialog(strainById(data.strain));
  else if (target.id === "strain-add") return openStrainDialog(null);
  else if (target.id === "export-json") return download(`cannalog-${dayKey(new Date())}.json`, toJson(state), "application/json");
  else if (target.id === "export-csv") return download(`cannalog-${dayKey(new Date())}.csv`, toCsv(state), "text/csv");
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
  if (form.id === "tag-form") {
    const tag = form.tag.value.trim();
    if (state.settings.effectTags.some((t) => t.tag === tag)) return alert(`"${tag}" already exists`);
    state.settings.effectTags.push({ tag, good: form.good.value === "true" });
  }
  commit();
}

/** Score buttons and effect chips in the entry dialog. */
function onEntryChoiceClick(event) {
  const button = event.target.closest("button[data-score], button[data-effect]");
  if (!button) return;
  const { score, value, effect } = button.dataset;
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

function wireEvents() {
  for (const button of document.querySelectorAll("nav [data-view]")) {
    button.onclick = () => {
      view = button.dataset.view;
      render();
    };
  }
  $("#add-entry").onclick = () => openEntryDialog(null);
  window.addEventListener("resize", () => {
    if (view === "trends") renderTrends();
  });

  const main = document.querySelector("main");
  main.addEventListener("click", onViewClick);
  main.addEventListener("change", onViewChange);
  main.addEventListener("submit", onViewSubmit);

  const entryForm = $("#entry-form");
  entryForm.addEventListener("click", onEntryChoiceClick);
  entryForm.addEventListener("input", updateEntryPreview);
  entryForm.strainId.addEventListener("change", () => {
    entryForm.route.value = FORMS[selectedStrain().form].defaultRoute;
    updateEntryPreview();
  });
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
  try {
    const backup = fromJson(await file.text());
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

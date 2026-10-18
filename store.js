// Data shape, validation, local storage, JSON/CSV backup. No DOM. Shape is documented in docs/data.md.

import { activeMg, dayKey, productMg } from "./calc.js";

export const STORAGE_KEY = "cannalog.v1";
export const FORMS = {
  flower: { amountUnit: "mg", strengthUnit: "%", defaultRoute: "inhaled" },
  oil: { amountUnit: "ml", strengthUnit: "mg/ml", defaultRoute: "oral" },
  edible: { amountUnit: "units", strengthUnit: "mg/unit", defaultRoute: "oral" },
};
export const ROUTES = ["inhaled", "oral"];

export function defaultSettings() {
  return {
    calcMode: "decarb",
    symptoms: [
      { name: "mood", higherIsBetter: true },
      { name: "pain", higherIsBetter: false },
      { name: "ADHD", higherIsBetter: false },
    ],
    effectTags: [
      { tag: "relaxed", good: true },
      { tag: "focused", good: true },
      { tag: "pain relief", good: true },
      { tag: "better sleep", good: true },
      { tag: "appetite", good: true },
      { tag: "anxious", good: false },
      { tag: "dry mouth", good: false },
      { tag: "foggy", good: false },
      { tag: "tired", good: false },
      { tag: "dizzy", good: false },
    ],
  };
}

export function emptyState() {
  return { version: 1, strains: [], entries: [], settings: defaultSettings() };
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---------- validation: errors name the broken item and value ----------

const isNumber = (x) => typeof x === "number" && Number.isFinite(x);
const isText = (x) => typeof x === "string";

function check(ok, message) {
  if (!ok) throw new Error(`Invalid data: ${message}`);
}

export function validateStrain(strain, where = "strain") {
  check(isText(strain?.id) && isText(strain.name) && strain.name.trim() !== "", `${where} needs an id and a name`);
  const label = `${where} "${strain.name}"`;
  check(strain.form in FORMS, `${label}: form "${strain.form}" must be one of ${Object.keys(FORMS).join(", ")}`);
  check(isNumber(strain.thc) && strain.thc >= 0, `${label}: thc ${strain.thc} must be a number ≥ 0`);
  check(isNumber(strain.cbd) && strain.cbd >= 0, `${label}: cbd ${strain.cbd} must be a number ≥ 0`);
  if (strain.form === "flower") {
    check(strain.thc + strain.cbd <= 100, `${label}: thc + cbd = ${strain.thc + strain.cbd}% is over 100%`);
  }
  check(typeof strain.acid === "boolean", `${label}: acid must be true or false`);
}

export function validateEntry(entry) {
  check(isText(entry?.id), "entry needs an id");
  const label = `entry ${entry.id}`;
  check(isText(entry.t) && !Number.isNaN(Date.parse(entry.t)), `${label}: time "${entry.t}" is not a date`);
  validateStrain(entry.strain, `${label} strain`);
  check(isNumber(entry.amount) && entry.amount > 0, `${label}: amount ${entry.amount} must be > 0`);
  check(ROUTES.includes(entry.route), `${label}: route "${entry.route}" must be one of ${ROUTES.join(", ")}`);
  check(isText(entry.note), `${label}: note must be text`);
  for (const [name, value] of Object.entries(entry.scores ?? {})) {
    check(isNumber(value) && value >= 0 && value <= 10, `${label}: score ${name} = ${value} must be 0–10`);
  }
  check(Array.isArray(entry.effects), `${label}: effects must be a list`);
  for (const effect of entry.effects) {
    check(isText(effect.tag) && typeof effect.good === "boolean", `${label}: bad effect ${JSON.stringify(effect)}`);
  }
}

/** Throws a readable Error if `state` is unusable; returns it otherwise. */
export function validate(state) {
  check(state?.version === 1, `version must be 1, got ${state?.version}`);
  check(Array.isArray(state.strains), "strains must be a list");
  check(Array.isArray(state.entries), "entries must be a list");
  for (const strain of state.strains) validateStrain(strain);
  for (const entry of state.entries) validateEntry(entry);
  const settings = state.settings;
  check(settings?.calcMode in { raw: 1, decarb: 1, absorbed: 1 }, `calcMode "${settings?.calcMode}" unknown`);
  check(Array.isArray(settings.symptoms), "settings.symptoms must be a list");
  check(Array.isArray(settings.effectTags), "settings.effectTags must be a list");
  return state;
}

// ---------- local storage ----------

/** Load saved state; empty state if nothing saved. Throws if saved data is broken (don't silently lose it). */
export function load(storage = globalThis.localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  return fromJson(raw);
}

export function save(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- backup ----------

export function toJson(state) {
  return JSON.stringify(state, null, 2);
}

export function fromJson(text) {
  return validate(JSON.parse(text));
}

/**
 * Merge a backup into the current state. Same id → backup wins. Settings: current wins.
 * Restoring into an empty app gives exactly the backup's data.
 */
export function merge(current, backup) {
  const byId = (list) => new Map(list.map((item) => [item.id, item]));
  const strains = byId(current.strains);
  for (const strain of backup.strains) strains.set(strain.id, strain);
  const entries = byId(current.entries);
  for (const entry of backup.entries) entries.set(entry.id, entry);
  return { ...current, strains: [...strains.values()], entries: [...entries.values()] };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** One row per entry, for spreadsheets. mg columns use the current calc mode. */
export function toCsv(state) {
  const mode = state.settings.calcMode;
  const symptomNames = state.settings.symptoms.map((s) => s.name);
  const header = [
    "day",
    "time",
    "strain",
    "form",
    "amount",
    "route",
    "thc_mg_product",
    "cbd_mg_product",
    `thc_mg_${mode}_low`,
    `thc_mg_${mode}_high`,
    `cbd_mg_${mode}_low`,
    `cbd_mg_${mode}_high`,
    ...symptomNames,
    "good_effects",
    "bad_effects",
    "note",
  ];
  const rows = [...state.entries]
    .sort((a, b) => a.t.localeCompare(b.t))
    .map((entry) => {
      const product = productMg(entry);
      const active = activeMg(entry, mode);
      const tags = (good) =>
        entry.effects
          .filter((e) => e.good === good)
          .map((e) => e.tag)
          .join("; ");
      return [
        dayKey(entry.t),
        entry.t,
        entry.strain.name,
        entry.strain.form,
        entry.amount,
        entry.route,
        product.thc,
        product.cbd,
        ...active.thc,
        ...active.cbd,
        ...symptomNames.map((name) => entry.scores[name]),
        tags(true),
        tags(false),
        entry.note,
      ];
    });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

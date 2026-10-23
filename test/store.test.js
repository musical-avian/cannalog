import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emptyState, fromJson, load, merge, save, toCsv, toJson, validate } from "../store.js";

const strain = { id: "s1", name: 'Flower, "A"', form: "flower", thc: 20, cbd: 1, acid: false };
const entry = {
  id: "e1",
  t: "2026-10-18T10:00:00.000Z",
  strain,
  amount: 100,
  route: "inhaled",
  note: "calm,\nslept well",
  scores: { mood: 7 },
  effects: [{ tag: "relaxed", good: true }],
};
// Deep copy: tests mutate their sample, that must not leak into the next test.
const sample = () => structuredClone({ ...emptyState(), strains: [strain], entries: [entry] });

const memoryStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
};

test("empty and sample states are valid", () => {
  assert.doesNotThrow(() => validate(emptyState()));
  assert.doesNotThrow(() => validate(sample()));
});

test("JSON and storage roundtrip", () => {
  assert.deepEqual(fromJson(toJson(sample())), sample());
  const storage = memoryStorage();
  assert.deepEqual(load(storage), emptyState());
  save(sample(), storage);
  assert.deepEqual(load(storage), sample());
});

test("bad data gives a message naming the item and value", () => {
  const s = sample();
  s.entries[0].amount = -5;
  assert.throws(() => validate(s), /entry e1: amount -5 must be > 0/);
  const t = sample();
  t.strains[0].thc = 99.5;
  assert.throws(() => validate(t), /over 100%/);
  assert.throws(() => fromJson("{}"), /version must be 1/);
});

test("merge: backup wins on same id, keeps others", () => {
  const current = sample();
  const backup = sample();
  backup.entries = [
    { ...entry, note: "from backup" },
    { ...entry, id: "e2" },
  ];
  const merged = merge(current, backup);
  assert.equal(merged.entries.length, 2);
  assert.equal(merged.entries.find((e) => e.id === "e1").note, "from backup");
  assert.deepEqual(merge(emptyState(), sample()), sample());
});

test("CSV quotes commas, quotes and newlines", () => {
  const lines = toCsv(sample()).split("\n");
  assert.match(lines[0], /^day,time,strain,/);
  assert.match(lines[1], /"Flower, ""A"""/);
  assert.match(toCsv(sample()), /"calm,\nslept well"$/);
});

test("theme: missing is fine (older data), unknown is rejected", () => {
  const old = sample();
  delete old.settings.theme;
  assert.doesNotThrow(() => validate(old));
  const bad = sample();
  bad.settings.theme = "purple";
  assert.throws(() => validate(bad), /theme "purple"/);
});

test("dark color tokens are identical for auto and manual dark mode", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tokensAfter = (marker) => {
    const start = html.indexOf(marker);
    const block = html.slice(start, html.indexOf("}", start));
    return block.match(/--[\w-]+:\s*[^;]+;/g);
  };
  const auto = tokensAfter(':root:not([data-theme="light"]) {');
  const manual = tokensAfter(':root[data-theme="dark"] {');
  assert.ok(auto.length > 5);
  assert.deepEqual(manual, auto);
});

test("daily limit: optional, must be > 0 when set", () => {
  const s = sample();
  assert.doesNotThrow(() => validate(s));
  s.settings.dailyLimitMg = null;
  assert.doesNotThrow(() => validate(s));
  s.settings.dailyLimitMg = 30;
  assert.doesNotThrow(() => validate(s));
  s.settings.dailyLimitMg = 0;
  assert.throws(() => validate(s), /dailyLimitMg 0 must be a number > 0/);
});

test("no-dose entry: valid without product, needs a watch tag or note; old data without watch fields is valid", () => {
  const s = sample();
  delete s.settings.watchTags;
  assert.doesNotThrow(() => validate(s));
  const craving = { id: "c1", t: "2026-10-18T12:00:00.000Z", noDose: true, note: "", scores: {}, effects: [], watch: ["craving"] };
  s.entries.push(craving);
  assert.doesNotThrow(() => validate(s));
  assert.match(toCsv(s), /\(no dose\).*craving/);
  craving.watch = [];
  assert.throws(() => validate(s), /entry c1: entry without dose needs a tag, a score or a note/);
});

test("after ratings: optional, checked, in CSV", () => {
  const s = sample();
  s.entries[0].after = { t: "2026-10-18T11:30:00.000Z", scores: { mood: 9 } };
  assert.doesNotThrow(() => validate(s));
  const lines = toCsv(s).split("\n");
  assert.match(lines[0], /after_time,after_mood/);
  assert.match(lines[1], /2026-10-18T11:30:00.000Z,9/);
  s.entries[0].after.scores.mood = 11;
  assert.throws(() => validate(s), /entry e1: after score mood = 11 must be 0–10/);
  s.entries[0].after = { t: "2026-10-18T09:00:00.000Z", scores: {} };
  assert.throws(() => validate(s), /entry e1: after time 2026-10-18T09:00:00.000Z is before the dose/);
  s.entries[0].after = { t: "later", scores: {} };
  assert.throws(() => validate(s), /entry e1: after time "later" is not a date/);
  const noDose = { id: "n1", t: "2026-10-18T12:00:00.000Z", noDose: true, note: "x", scores: {}, effects: [] };
  noDose.after = { t: "2026-10-18T13:00:00.000Z", scores: {} };
  assert.throws(() => validate({ ...sample(), entries: [noDose] }), /entry n1: "after" ratings need a dose/);
});

test("anxiety: added once to older settings, stays deleted if removed", () => {
  const storage = memoryStorage();
  const old = sample();
  old.settings.symptoms = old.settings.symptoms.filter((s) => s.name !== "anxiety");
  delete old.settings.symptomsVersion;
  storage.setItem("cannalog.v1", JSON.stringify(old));
  const upgraded = load(storage);
  assert.ok(upgraded.settings.symptoms.some((s) => s.name === "anxiety" && s.higherIsBetter === false));
  upgraded.settings.symptoms = upgraded.settings.symptoms.filter((s) => s.name !== "anxiety");
  save(upgraded, storage);
  assert.ok(!load(storage).settings.symptoms.some((s) => s.name === "anxiety"));
});

test("restore into an empty app keeps the backup's own settings", () => {
  const backup = sample();
  backup.settings.symptoms.push({ name: "nausea", higherIsBetter: false });
  backup.settings.dailyLimitMg = 20;
  const restored = merge(emptyState(), backup);
  assert.deepEqual(restored.settings, backup.settings);
  assert.deepEqual(restored.entries, backup.entries);
});

test("vaporizer load + sips: valid, orphan sip rejected, CSV has split mg", () => {
  const s = sample();
  s.entries[0].note = ""; // the sample note has a line break, which would split the CSV row below
  s.entries[0].load = { open: true, used: 1 };
  s.entries.push({ id: "s1", t: "2026-10-18T12:00:00.000Z", sipOf: "e1", note: "", scores: {}, effects: [], watch: [] });
  assert.doesNotThrow(() => validate(s));
  const csv = toCsv(s).split("\n");
  assert.equal(csv.length, 3); // header + load + sip
  assert.match(csv[2], /,e1,/); // sip row points to its load
  assert.match(csv[2], /,50,/); // 100 mg load split over 2 uses
  s.entries[0].load.used = 0.3;
  assert.throws(() => validate(s), /load.used 0.3 must be one of/);
  s.entries[0].load.used = 1;
  s.entries[1].sipOf = "gone";
  assert.throws(() => validate(s), /entry s1: sip of load gone, but that load does not exist/);
});

test("closed vaporizer load counting fully is valid; old guessed fractions stay valid", () => {
  const s = sample();
  s.entries[0].load = { open: false, used: 1 };
  assert.doesNotThrow(() => validate(s));
  s.entries[0].load.used = 0.5; // written by an earlier version
  assert.doesNotThrow(() => validate(s));
});

test("context tags: optional, validated, in CSV; no-dose entry with only context is valid", () => {
  const s = sample();
  delete s.settings.contextTags;
  assert.doesNotThrow(() => validate(s)); // older data
  s.settings.contextTags = [{ tag: "exercise", kind: "beneficial", unit: "min" }];
  s.entries.push({
    id: "c1",
    t: "2026-10-18T12:00:00.000Z",
    noDose: true,
    note: "",
    scores: {},
    effects: [],
    context: [{ tag: "exercise", value: 30 }],
  });
  assert.doesNotThrow(() => validate(s));
  assert.match(toCsv(s), /exercise 30/);
  s.entries[1].context[0].value = -1;
  assert.throws(() => validate(s), /entry c1: bad context/);
  s.entries[1].context[0].value = null;
  s.settings.contextTags[0].kind = "great";
  assert.throws(() => validate(s), /kind "great" must be one of/);
});

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

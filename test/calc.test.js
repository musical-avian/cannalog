import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  activeMg,
  DECARB_FACTOR,
  dayRange,
  goodness,
  groupByDay,
  productMg,
  ratioText,
  rollingAverage,
  SOURCES,
  summarize,
  thcShare,
  trend,
  weekStart,
} from "../calc.js";

const flower = { id: "s1", name: "Test flower", form: "flower", thc: 20, cbd: 1, acid: false };
const oil = { id: "s2", name: "Test oil", form: "oil", thc: 10, cbd: 10, acid: false };
const edible = { id: "s3", name: "Gummy", form: "edible", thc: 5, cbd: 0, acid: false };
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const entry = (strain, amount, extra = {}) => ({
  id: `e${Math.random()}`,
  t: at(2026, 10, 18),
  strain,
  amount,
  route: strain.form === "flower" ? "inhaled" : "oral",
  note: "",
  scores: {},
  effects: [],
  ...extra,
});

test("every source URL is listed in docs/sources.md", () => {
  const docs = readFileSync(new URL("../docs/sources.md", import.meta.url), "utf8");
  for (const source of Object.values(SOURCES)) assert.ok(docs.includes(source.url), `missing in docs: ${source.url}`);
});

test("product mg per form", () => {
  assert.deepEqual(productMg(entry(flower, 100)), { thc: 20, cbd: 1 }); // 100 mg × 20% / 1%
  assert.deepEqual(productMg(entry(oil, 0.5)), { thc: 5, cbd: 5 }); // 0.5 ml × 10 mg/ml
  assert.deepEqual(productMg(entry(edible, 2)), { thc: 10, cbd: 0 }); // 2 units × 5 mg
});

test("decarb factor from molar masses, applied only to acid labels", () => {
  assert.ok(Math.abs(DECARB_FACTOR - 0.877) < 0.001);
  assert.deepEqual(activeMg(entry(flower, 100), "decarb").thc, [20, 20]);
  const acidFlower = { ...flower, acid: true };
  const [low, high] = activeMg(entry(acidFlower, 100), "decarb").thc;
  assert.ok(Math.abs(low - 17.54) < 0.01 && low === high);
});

test("absorbed gives a range that depends on route", () => {
  const inhaled = activeMg(entry(flower, 100), "absorbed").thc;
  assert.ok(Math.abs(inhaled[0] - 0.4) < 1e-9 && Math.abs(inhaled[1] - 11.2) < 1e-9); // 20 mg × 2–56%
  const oral = activeMg(entry(flower, 100, { route: "oral" }), "absorbed").thc;
  assert.ok(Math.abs(oral[0] - 0.8) < 1e-9 && Math.abs(oral[1] - 2.4) < 1e-9); // 20 mg × 4–12%
});

test("unknown mode fails loudly", () => {
  assert.throws(() => activeMg(entry(flower, 1), "nope"), /Unknown calc mode "nope"/);
});

test("ratio text and THC share", () => {
  assert.equal(ratioText(20, 10), "2:1");
  assert.equal(ratioText(5, 15), "1:3");
  assert.equal(ratioText(5, 0), "THC only");
  assert.equal(ratioText(0, 5), "CBD only");
  assert.equal(ratioText(0, 0), "–");
  assert.equal(thcShare(15, 5), 75);
  assert.equal(thcShare(0, 0), null);
});

test("week starts Monday, day range is inclusive", () => {
  assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday → previous Monday
  assert.equal(weekStart("2026-10-12"), "2026-10-12");
  assert.deepEqual(dayRange("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

test("summary adds mg, averages scores, counts effects; grouping sorts by time", () => {
  const late = entry(flower, 100, { t: at(2026, 10, 18, 20), scores: { mood: 8 }, effects: [{ tag: "relaxed", good: true }] });
  const early = entry(oil, 1, { t: at(2026, 10, 18, 8), scores: { mood: 4, pain: 6 }, effects: [{ tag: "relaxed", good: true }] });
  const s = summarize([late, early], "raw");
  assert.deepEqual(s.thc, [30, 30]);
  assert.deepEqual(s.cbd, [11, 11]);
  assert.deepEqual(s.scores, { mood: 6, pain: 6 });
  assert.deepEqual(s.effects, { relaxed: { count: 2, good: true } });
  assert.deepEqual(groupByDay([late, early])["2026-10-18"], [early, late]);
});

test("rolling average skips gaps", () => {
  assert.deepEqual(rollingAverage([2, null, 4, null, null, null], 3), [2, 2, 3, 4, 4, null]);
});

test("trend direction respects higherIsBetter and threshold", () => {
  assert.equal(trend(7, 5, true), "better");
  assert.equal(trend(7, 5, false), "worse");
  assert.equal(trend(5.2, 5, true), "same");
  assert.equal(trend(null, 5, true), "none");
  assert.equal(goodness(2, false), 0.8);
  assert.equal(goodness(10, true), 1);
});

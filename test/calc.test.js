import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  activeMg,
  DECARB_FACTOR,
  dailyThcSeries,
  dayRange,
  expandLoads,
  goodness,
  groupByDay,
  isDose,
  isSip,
  mean,
  median,
  pearson,
  planForMg,
  productMg,
  ratioText,
  relationDirection,
  rollingAverage,
  SOURCES,
  slope,
  smoothTrend,
  strengthLabel,
  summarize,
  tagComparisons,
  thcShare,
  trend,
  usageChange,
  useCorrelations,
  useFreeDays,
  weeklyRate,
  weeklySeries,
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

test("smoothed trend moves 10% toward each value", () => {
  assert.deepEqual(smoothTrend([10, 20, 20]), [10, 11, 11.9]);
});

test("slope of a straight line, weekly rate direction", () => {
  assert.equal(slope([1, 3, 5, 7]), 2);
  const rising = Array.from({ length: 28 }, (_, day) => 10 + day * 0.5); // +3.5 mg/day per week
  assert.ok(Math.abs(weeklyRate(rising).perWeek - 3.5) < 1e-9);
  assert.equal(weeklyRate(rising).direction, "worse");
  assert.equal(weeklyRate(rising.toReversed()).direction, "better");
  assert.equal(weeklyRate(Array(28).fill(10)).direction, "same");
  assert.equal(weeklyRate(Array(28).fill(0)).direction, "same");
});

test("median, mean, use-free days count zeros", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(mean([0, 0, 6]), 2);
  const flower = { id: "s", name: "x", form: "flower", thc: 10, cbd: 0, acid: false };
  const used = {
    id: "e",
    t: new Date(2026, 9, 18, 12).toISOString(),
    strain: flower,
    amount: 100,
    route: "inhaled",
    note: "",
    scores: {},
    effects: [],
  };
  const byDay = groupByDay([used]);
  const keys = ["2026-10-17", "2026-10-18"];
  assert.deepEqual(dailyThcSeries(keys, byDay, "raw"), [0, 10]);
  assert.equal(useFreeDays(keys, byDay), 1);
});

test("usage change: less is better, tiny changes are the same", () => {
  assert.equal(usageChange(12, 10), "worse");
  assert.equal(usageChange(8, 10), "better");
  assert.equal(usageChange(10.2, 10), "same");
  assert.equal(usageChange(0, 0), "same");
  assert.equal(usageChange(1, 0), "worse");
});

const totals = (plan) => {
  let thc = 0;
  let cbd = 0;
  for (const part of plan.parts) {
    const mg = productMg({ strain: part.strain, amount: part.amount });
    thc += mg.thc;
    cbd += mg.cbd;
  }
  return { thc, cbd };
};
const close = (a, b) => Math.abs(a - b) < 1e-9;
const calcFlower = { id: "f", name: "Flower", form: "flower", thc: 20, cbd: 1, acid: false };
const calcOil = { id: "o", name: "Oil", form: "oil", thc: 10, cbd: 10, acid: false };
const cbdOnly = { id: "c", name: "CBD only", form: "oil", thc: 0, cbd: 20, acid: false };

test("calculator, 1 product: THC sets the amount, or CBD if no THC given", () => {
  const plan = planForMg([calcFlower], 15, 0, "decarb");
  assert.ok(close(plan.parts[0].amount, 75)); // 75 mg × 20% = 15 mg
  assert.ok(close(planForMg([cbdOnly], 0, 10, "decarb").parts[0].amount, 0.5)); // 0.5 ml × 20 mg/ml
  assert.match(planForMg([cbdOnly], 5, 0, "decarb").error, /has no THC/); // was an uncaught crash before
  const acid = { ...calcFlower, acid: true };
  assert.ok(planForMg([acid], 15, 0, "decarb").parts[0].amount > planForMg([acid], 15, 0, "raw").parts[0].amount);
});

test("calculator, 2 products: hits THC and CBD mg exactly, explains impossible targets", () => {
  const mg = totals(planForMg([calcFlower, calcOil], 5, 3, "decarb")); // 5:3 lies between 20:1 and 1:1
  assert.ok(close(mg.thc, 5) && close(mg.cbd, 3));
  assert.match(planForMg([calcFlower, calcOil], 5, 10, "decarb").error, /can't be made/); // 1:2 is CBD-heavier than both
  const withCbdOnly = totals(planForMg([calcFlower, cbdOnly], 5, 10, "decarb"));
  assert.ok(close(withCbdOnly.thc, 5) && close(withCbdOnly.cbd, 10));
  assert.match(planForMg([calcFlower, calcOil], 30, 1, "decarb").error, /can't be made/); // 30:1 > flower's 20:1
  assert.match(planForMg([calcOil, { ...calcOil, id: "o2" }], 5, 5, "decarb").error, /same THC:CBD ratio/);
  assert.match(planForMg([calcFlower, calcOil], 5, Number.NaN, "decarb").error, /enter both/);
});

test("no-dose entries add no mg, are not uses, keep watch tags, don't break use-free days", () => {
  const craving = {
    id: "c",
    t: new Date(2026, 9, 18, 12).toISOString(),
    noDose: true,
    note: "",
    scores: {},
    effects: [],
    watch: ["craving"],
  };
  const s = summarize([craving], "decarb");
  assert.deepEqual(s.thc, [0, 0]);
  assert.equal(s.count, 0);
  assert.deepEqual(s.watch, { craving: 1 });
  assert.equal(isDose(craving), false);
  assert.equal(useFreeDays(["2026-10-18"], groupByDay([craving])), 1);
});

test("vaporizer load: mg split evenly over fill + sips, scaled by how much was used", () => {
  const flower = { id: "f", name: "Flower", form: "flower", thc: 20, cbd: 0, acid: false };
  const at = (day, hour) => new Date(2026, 9, day, hour).toISOString();
  const load = {
    id: "L",
    t: at(18, 8),
    strain: flower,
    amount: 150,
    route: "inhaled",
    note: "",
    scores: {},
    effects: [],
    load: { open: true, used: 1 },
  };
  const sip = (id, day, hour) => ({ id, t: at(day, hour), sipOf: "L", note: "", scores: {}, effects: [], watch: [] });

  assert.deepEqual(
    expandLoads([load]).map((e) => e.amount),
    [150],
  ); // no sips yet: all at fill time
  const expanded = expandLoads([load, sip("s1", 18, 12), sip("s2", 18, 20)]);
  assert.deepEqual(
    expanded.map((e) => e.amount),
    [50, 50, 50],
  );
  assert.equal(expanded[1].strain.name, "Flower");
  assert.deepEqual(summarize(expanded, "raw").thc, [30, 30]); // 150 mg × 20%
  assert.equal(summarize(expanded, "raw").count, 3); // every sip is a use

  const halfUsed = { ...load, load: { open: false, used: 0.5 } };
  assert.deepEqual(
    expandLoads([halfUsed, sip("s1", 18, 12), sip("s2", 18, 20)]).map((e) => e.amount),
    [25, 25, 25],
  );

  const afterMidnight = groupByDay(expandLoads([load, sip("s1", 19, 1)]));
  assert.equal(afterMidnight["2026-10-19"][0].amount, 75); // the sip counts on the day it happened
  assert.equal(useFreeDays(["2026-10-19"], afterMidnight), 0);
  assert.equal(isSip(sip("x", 18, 9)), true);
});

test("pearson: exact on straight lines, skips gaps, needs enough days", () => {
  const xs = Array.from({ length: 12 }, (_, i) => i);
  assert.ok(
    Math.abs(
      pearson(
        xs,
        xs.map((x) => 2 * x + 1),
      ).r - 1,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      pearson(
        xs,
        xs.map((x) => -x),
      ).r + 1,
    ) < 1e-12,
  );
  const withGaps = xs.map((x) => (x % 4 === 0 ? null : x));
  assert.equal(pearson(xs, withGaps).n, 9);
  assert.equal(pearson(xs, withGaps).r, null); // 9 < 10 paired days
  assert.equal(pearson(xs, Array(12).fill(5)).r, null); // no variation
  assert.equal(strengthLabel(0.05), "none");
  assert.equal(strengthLabel(-0.35), "moderate");
  assert.equal(strengthLabel(null), "too few");
  assert.equal(relationDirection(-0.6, false), "better"); // more THC, less pain
  assert.equal(relationDirection(-0.6, true), "worse"); // more THC, lower mood
});

test("use correlations: same day, next day, use-free vs use days; tag comparisons; weekly series", () => {
  const pain = { name: "pain", higherIsBetter: false };
  // 20 days: THC 0 or 10 alternating; pain is high the day AFTER use.
  const days = Array.from({ length: 20 }, (_, i) => ({
    key: `2026-10-${String(i + 1).padStart(2, "0")}`,
    thc: i % 2 === 0 ? 10 : 0,
    scores: { pain: i % 2 === 1 ? 8 : 2 },
    tags: i % 4 === 0 ? { exercise: 1 } : {},
  }));
  const [row] = useCorrelations(days, [pain]);
  assert.ok(row.sameDay.r < -0.99); // use days have low pain
  assert.ok(row.nextDay.r > 0.99); // pain high the day after use
  assert.equal(row.freeMean, 8);
  assert.equal(row.useMean, 2);
  const [exercise] = tagComparisons(days, ["exercise", "rare"], [pain]);
  assert.equal(exercise.tag, "exercise");
  assert.equal(exercise.daysWith, 5);
  assert.equal(exercise.thcWith, 10);
  assert.equal(tagComparisons(days, ["rare"], [pain]).length, 0); // fewer than 3 days → left out
  const weeks = weeklySeries(days);
  assert.equal(weeks[0].key, weekStart("2026-10-01"));
  assert.ok(weeks.every((w) => w.thcPerDay >= 0 && w.scores.pain != null));
});

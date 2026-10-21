import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dayStart, expandLoads } from "../calc.js";
import { buildReport } from "../report.js";
import { defaultContextTags, defaultSettings, defaultWatchTags } from "../store.js";

test("report: German, one SVG per view, tag strips, correlation table", () => {
  const flower = { id: "f", name: "Flower", form: "flower", thc: 20, cbd: 0, acid: false };
  const today = "2026-10-21";
  const entries = [];
  for (let i = 0; i < 60; i++) {
    const key = addDays(today, -i);
    const noon = new Date(dayStart(key).getTime() + 12 * 3600 * 1000).toISOString();
    const used = i % 2 === 0;
    const context = i % 3 === 0 ? [{ tag: "exercise", value: 30 }] : [];
    if (used)
      entries.push({
        id: `d${i}`,
        t: noon,
        strain: flower,
        amount: 100,
        route: "inhaled",
        note: "",
        scores: { pain: 3 },
        effects: [],
        context,
      });
    else entries.push({ id: `n${i}`, t: noon, noDose: true, note: "", scores: { pain: 7 }, effects: [], context });
  }
  const html = buildReport({
    entries: expandLoads(entries),
    settings: defaultSettings(),
    mode: "decarb",
    todayKey: today,
    appVersion: "test",
    sourceUrl: "https://example.org",
    contextTags: defaultContextTags(),
    watchTags: defaultWatchTags(),
  });
  assert.match(html, /Cannabis-Tagebuch – Bericht/);
  assert.match(html, /Selbstauskunft/);
  assert.equal((html.match(/<svg class="chart"/g) ?? []).length, 2);
  assert.match(html, />Bewegung</); // exercise strip, German name
  assert.match(html, /Schmerz/);
  assert.match(html, /stark: mehr THC – besser/); // pain 3 on use days vs 7 on free days
  assert.doesNotMatch(html, /NaN|undefined/);
});

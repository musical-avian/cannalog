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
  assert.match(html, /class="summary"/); // visual summary at the top
  assert.match(html, /Mehr THC am Tag geht einher mit/);
  assert.equal((html.match(/<svg class="chart"/g) ?? []).length, 2);
  assert.match(html, />Bewegung</); // exercise strip, German name
  assert.match(html, /Schmerz/);
  assert.match(html, /stark: mehr THC – besser/); // pain 3 on use days vs 7 on free days
  assert.doesNotMatch(html, /Ohne Vergleich/); // exercise every 3rd day is comparable
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("report: daily amount tag (sleep h) gets an r row instead of 'Ohne Vergleich'", () => {
  const flower = { id: "f", name: "Flower", form: "flower", thc: 20, cbd: 0, acid: false };
  const today = "2026-10-21";
  const entries = [];
  for (let i = 0; i < 40; i++) {
    const key = addDays(today, -i);
    const noon = new Date(dayStart(key).getTime() + 12 * 3600 * 1000).toISOString();
    const sleep = 5 + (i % 4);
    entries.push({
      id: `d${i}`,
      t: noon,
      strain: flower,
      amount: 200 - sleep * 20,
      route: "inhaled",
      note: "",
      scores: { anxiety: 12 - sleep },
      effects: [],
      context: [{ tag: "sleep", value: sleep }],
    });
  }
  const html = buildReport({
    entries: expandLoads(entries),
    settings: defaultSettings(),
    mode: "raw",
    todayKey: today,
    appVersion: "test",
    sourceUrl: "https://example.org",
    contextTags: defaultContextTags(),
    watchTags: defaultWatchTags(),
  });
  assert.match(html, /<th>Menge<\/th>/);
  assert.match(html, /Schlaf \(h\)/);
  assert.match(html, /weniger THC/);
  assert.doesNotMatch(html, /Ohne Vergleich[^<]*Schlaf/); // covered by the amount table now
  assert.match(html, /– <span class="muted">\(0 T\)<\/span>/); // no use-free days: no mean
});

# Data

Stored in `localStorage["cannalog.v1"]` as JSON. Same shape in the JSON backup. Validated on load and import (`store.js` → `validate`).

```js
{
  version: 1,
  strains: [Strain],
  entries: [Entry],
  settings: {
    calcMode: "raw" | "decarb" | "absorbed",
    theme: "auto" | "light" | "dark",   // optional, missing = auto (follow phone)
    dailyLimitMg: 30,                    // optional personal THC ceiling, null/missing = off
    symptoms: [{ name: "mood", higherIsBetter: true }],
    effectTags: [{ tag: "relaxed", good: true }],
    watchTags: [{ tag: "craving" }],      // optional, missing = defaults
  },
}

Strain = {
  id: "uuid",
  name: "text",
  form: "flower" | "oil" | "edible",
  thc: 22,     // flower: % w/w, oil: mg/ml, edible: mg/unit
  cbd: 1,
  acid: true,  // label lists THCA/CBDA → decarb factor applies
}

Entry = {
  id: "uuid",
  t: "2026-10-18T07:00:00.000Z",   // ISO, UTC; days are computed in local time
  strain: Strain,                  // copy at logging time (D3)
  amount: 100,                     // flower: mg, oil: ml, edible: units
  route: "inhaled" | "oral",
  note: "text",
  scores: { mood: 6, pain: 3 },    // 0–10, only rated symptoms
  effects: [{ tag: "dry mouth", good: false }],
  watch: ["craving"],              // optional, watch tag names
}

// Entry without dose (craving, event): no strain/amount/route; needs a watch tag or a note.
NoDoseEntry = { id, t, noDose: true, note, scores, effects, watch }
```

## Backup
- **Export JSON**: full state. Phone → share sheet (save to Files/Drive/mail yourself). Desktop → download.
- **Import JSON**: merges by id, backup wins; settings stay. Broken file → nothing changes, error says why.
- **Export CSV**: one row per entry, product mg + current-mode mg range, one column per symptom.

## Broken saved data
App does not overwrite it. It shows the error and the raw text to copy out.

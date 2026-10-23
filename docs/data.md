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
    symptoms: [{ name: "mood", higherIsBetter: true }],  // defaults: mood, pain, ADHD, anxiety
    symptomsVersion: 2,                  // optional; < 2 → anxiety added once on load
    effectTags: [{ tag: "relaxed", good: true }],
    watchTags: [{ tag: "craving" }],      // optional, missing = defaults
    contextTags: [{ tag: "exercise", kind: "beneficial" | "neutral", unit: "" | "mg" | "h" | "min" | "x" }], // optional, missing = defaults
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
  context: [{ tag: "exercise", value: 30 }], // optional; value may be null
  after: { t: "2026-10-18T08:30:00.000Z", scores: { pain: 3 } }, // optional (D30): how it felt later; scores = before.
                                   // Dose or sip only; t not before the dose; empty scores = "Skip" on the banner
}

// Vaporizer load: a normal dose entry with
//   load: { open: true|false, used: 1 }   // new loads: always 1; 0.75/0.5/0.25 only in older data
// Sip = one use of a load: no strain/amount/route; sipOf must be an existing load's id.
Sip = { id, t, sipOf: "load id", note, scores, effects, watch }

// Entry without dose (check-in, craving, event, habit): no strain/amount/route; needs a tag, a score or a note.
NoDoseEntry = { id, t, noDose: true, note, scores, effects, watch }
```

## Backup (Settings → Backup)
- **Save backup file**: JSON download → Downloads. Toast confirms; the browser may show nothing itself.
- **Share backup…**: share sheet (Drive, mail, Files). Sent as `text/plain` named `.json`, because Android refuses to share `application/json` files.
- **Copy backup**: JSON text to the clipboard; if blocked, the text is shown to copy by hand. Works even when downloads are blocked.
- **Restore**: from a file, or paste the copied text. Into an empty app (new phone) = exact restore incl. settings. Otherwise merges by id, backup wins; your settings stay. Broken text → nothing changes, error says why.
- **Save CSV**: one row per entry, product mg + current-mode mg range, one column per symptom, `after_time` + `after_<symptom>`, watch tags.
- **App version** is shown at the bottom of the card.

## Broken saved data
App does not overwrite it. It shows the error and the raw text to copy out.

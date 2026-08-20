# CHANGELOG

## 2026-08-21 (later) — Content expansion, planner UI, two silent bugs found

### Two real bugs, both found by verifying rather than assuming

**Evidence grades were null for the entire original library.** The GRADING map
was keyed on catalog slugs; the RAG library uses different entry ids. 29 of 46
sources came back ungraded, and `buildMaterialRules` falls through to "D" when
it sees no grades — so the model was being told "the best material available is
only grade D, say so out loud" on every single conversation. Silent, live, and
exactly backwards. All 46 now graded; distribution is 10 A, 12 B, 19 C, 5 D.

**Depth layers were being wiped on every re-ingest.** They were assigned by a
one-off UPDATE in the migration, but the ingest deletes and reinserts chunks, so
the next run reset all 184 rows to the column default and quietly disabled the
whole depth feature. Moved into the ingest itself, where anything derived from
chunk content belongs. Verified: 92 core / 46 deepening / 46 mastery.

### Content

Library grew 29 → 46 sources, 116 → 184 chunks, 3 → 6 shelves. New: stoicism
and ancient philosophy (5), attention and mindfulness (4), and emotion,
self-worth and performance (8). Written from scratch, each with its failure
mode, and graded harder than their public reputation — wu wei is D and called
the most-abused idea on its shelf; grit is C with the meta-analysis noted;
emotional intelligence is C because the questionnaires used in workplace
training add little beyond personality.

Verified retrieval on five situational queries across the new shelves: rumination
routes to mindfulness+emotion, people-pleasing to self-worth, "can't stop pushing
on a project that isn't working" to the grit note's *failure mode* chunk
specifically.

### Planner UI

/plan now builds and renders plans, and shows the dossier suggestion card when
one is due. The caveat is displayed under its own heading — "what this plan does
not do" — rather than buried, because a plan that hides its weakness is a sales
pitch.

### Safety re-verified after all of it

All four crisis cases unchanged. Retrieval reports "vector" on the non-crisis
paths and crisis replies still bypass the model entirely.

## 2026-08-21 — Design system, structured chat, drawn illustrations

Branch: `staging` (not merged to `main`, not on ulika.vercel.app yet).

### Ready for you to look at now

**Block 7 — design tokens.** Full token set in `globals.css`: surfaces, brass and
teal accents, and a colour per evidence grade (A green, B blue, C brass, D grey)
used identically in SourceCard, /train and /plan so the colour is learned once.
Spacing ladder 4→96. Motion is `cubic-bezier(0.16, 1, 0.3, 1)` everywhere —
120-180ms for micro-interactions, 300-500ms for blocks. No bounce or elastic
anywhere; this is a precise instrument settling, not a toy. Paper grain is an
inline SVG at 2.5% opacity, so there is no image asset to license or lose.

**Block 8 — structured chat.** The model now returns typed JSON blocks instead
of prose that gets regex-parsed. Rendered by real components:

- ObservationBlock, staggered 320ms per line, with a marker rule down the left
- QuestionBlock — each question opens its own answer field in place
- SourceCard with the grade colour, linking to /train/[slug]
- ChecklistBlock, ticks recorded to training_responses
- TimelineBlock, with the depth layer marked per step
- PatternCard — teal, italic, links to the situation in /dossier
- Drill with LiveTimerRing (SVG countdown ring, not a progress bar)
- SealedEnvelopeCard — a field assignment arrives sealed and opens when you are
  ready to do it, which is the behaviour the seal is trying to produce
- ThinkingIndicator, three honest phases matching what actually runs

**Fact vs inference is now visible.** Solid underline means it is literally in
what you wrote; dashed means the Mentalist concluded it. Marked at the span
level, no legend needed after the first time.

**The stamp.** One completion gesture — a press and slight rotation, like a
rubber stamp landing — used identically for a ticked checklist item, a finished
drill and a recorded assignment. The only place overshoot is permitted.

**Block 9 — drawn illustrations.** The two Memory Palace illustrations that
previously rendered a "pending" box are now inline SVG floor plans with the
route dashed through numbered stops. No stock imagery, no generated raster with
unclear provenance. They read theme tokens, so they cannot drift out of palette.

**Block 6 — planner as its own call.** `src/lib/planner/build.ts` plus
`/api/plan`. Takes the dossier, active tracks, retrieved chunks and the stated
pace/horizon; returns stages with a track, a depth layer and a day count. Stages
pointing at slugs that do not exist are dropped, because a plan that sends you
to a 404 is worse than a shorter plan. Depth layers are constrained by the
horizon — a fortnight gets core only.

Every plan carries a `caveat` naming its own honest weakness, and the model is
told never to make it reassuring. A real one from testing: "builds comfort in
low-stakes rehearsals but does not cover salary research, market benchmarking,
or how you'll hold up in an actual high-stakes conversation."

Dossier → suggested tracks is on the same route (GET). Rate-limited to once a
fortnight, skips anything already running, and the matcher is told to return
nothing far more often than it matches — an adjacent method is a wrong
recommendation dressed as insight, and it costs more trust than it gains.

Verified: two goals at different horizons produced 4 stages each, 0 invalid
slugs, day counts summing exactly to the horizon, and depth correctly limited
to core at 14 days while allowing deepening at 45.

### Verified by measurement, not assumption

**Crisis mode downgrade (Block 8 requirement + Block 10).** With the detector
fired: `data-crisis` container on, **0 elements with an active animation**
(measured via computed style across every descendant), 0 reveal classes, mode
tint forced transparent, sealed envelopes open by default, hotline still
present. Animation over a suicide disclosure is grotesque, so this is enforced
once at the container rather than trusted to each component individually.

**Block 10 — safety regression after the schema change.** All four crisis cases
re-run against the new JSON pipeline: buried suicidal signal followed by a
distraction → caught; coercive control → caught as abuse; ordinary row with a
slammed door → correctly not fired; "this deadline is killing me, I could
murder my PM" → correctly not fired. Crisis replies still return plain prose
rather than JSON, because that path bypasses the main model entirely.

**Hotline numbers still bypass the model.** All four verified present verbatim
from the static file.

**Quote verification in /analyze unaffected.** 6 lines returned, 0 dropped, 0
fabricated quotes surviving a check against the source text.

### Works, but needs your eyes before anyone else sees it

Nothing in this batch — no new written content was generated. The 12-direction
content expansion (Block 3) was not started, so there is no prose to proofread.

### Deliberately not in this batch

- **Block 3** — 12 directions × 3-5 notes each, and 5 full interactive lessons.
  This is the largest remaining piece and it is content work, where quality per
  item matters more than throughput.
- **Block 6 UI** — the engine and endpoint exist and are tested, but /plan does
  not yet render a generated plan or show the suggestion card. API only.
- **Block 1, OpenStax full ingest** — blocked on licensing, not effort. See below.
- **Block 7 page sweep** — tokens are in and the chat is rebuilt on them, but
  /, /train, /dossier, /intake still use the older class names. They render
  correctly (legacy aliases are mapped) but do not yet use the new spacing
  ladder or scroll-reveal.

### Standing licence finding

OpenStax **Psychology 2e is CC BY-NC-SA**, not CC BY as the brief assumed.
NonCommercial is incompatible with selling subscriptions, and ShareAlike could
reach our derived chunks. The 1st edition **is** plain CC BY but is retired and
no longer served by the archive API. It is therefore registered `reference_only`
— we cite and summarise, we do not store its text.

More generally: freely readable is not freely redistributable. gottman.com,
cnvc.org, pon.harvard.edu, authentichappiness.org and supermemo.guru are all
free to open and fully copyrighted. That distinction is enforced by the
`licence` column, not by discipline.

### Known gap in our own schema

`acquisition_method` has no value meaning "we wrote this ourselves", which is
what 29 of the sources actually are. Their `licence` is corrected to
`redistributable`; the enum value is still missing and needs a migration.

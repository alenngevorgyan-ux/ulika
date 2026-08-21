# ULIKA Interaction Engine — audit and plan

Written 2026-08-21 against branch `staging`. Nothing implemented; this is the
document to argue with before anything gets built.

---

## 1. Executive conclusion

**Build the state layer, not the mechanics.** The brief lists roughly sixty
interaction ideas. Most of them are downstream of one thing the product does
not have: **a chat message is a string, and every interactive block is
re-derived from that string on every render.**

That single fact blocks almost the entire brief. Not "makes it harder" —
blocks it. Sections 19, 34, 37, 40, 46, 50, 77, 85 and 98 are all impossible
until it changes, because they all require a block to still exist, with an
identity, after the message that produced it has scrolled away.

So the first phase is unglamorous: give blocks stable IDs, move interaction
results out of component state into storage, and let the next AI turn see what
the user actually did. Roughly two weeks of work with nothing visibly new.

Then three mechanics, not eight. **Evidence Tray → Hypothesis Arena →
Prediction/Outcome/Retrospective**, in that dependency order. Everything else
in the brief is either a variant of those, a duplicate of something that
already exists, or a gimmick that dies in week two.

The name "Interaction Engine" is fine but oversells it. What is actually needed
is a **case state reducer plus a block identity scheme**. Calling it an engine
invites building an engine.

---

## 2. Current architecture (real files)

```
src/app/chat/page.tsx              conversation list, localStorage, send loop
  └── parseBlocks(m.content)       ← RUNS AT RENDER, EVERY RENDER
        └── src/lib/mentalist/parseBlocks.ts
              ├── JSON path        → StructuredReply
              ├── legacy path      → parseReply.ts (old [NOTICED] format)
              └── prose fallback
  └── src/components/chat/ReplyBlocks.tsx
        └── switch (block.type)    ← not a registry
              └── local useState per block

src/app/api/chat/route.ts
  1. detectCrisis()                src/lib/safety/detector.ts   (own model call)
  2. loadMemory()                  src/lib/mentalist/memory.ts
  3. loadFollowUps()
  4. routeKnowledge()              src/lib/knowledge/router.ts  (own model call)
  5. buildMaterialRules()          src/lib/knowledge/materialRules.ts
  6. buildSystemPrompt()           src/lib/mentalist/systemPrompt.ts
  7. tool loop (max 5) + no-tools fallback
  8. extractMemory() + saveMemory()
  → NextResponse.json({ reply: string, crisis, retrieval, mode })
```

Persistence today:

| Data | Where | Notes |
|---|---|---|
| Conversations | `localStorage` only | `mentalist_conversations` table **exists and is used by nothing** |
| Memory / dossier | `mentalist_memory` | working |
| Lesson answers | `training_responses` | written, never read back into UI |
| Checklist ticks | `training_responses` | written, never read back — tick state is lost on reload |
| Tracks, plans, suggestions | own tables | working |
| Knowledge | `knowledge_*` + pgvector | 46 sources, 184 chunks, 6 shelves |

---

## 3. What already exists and is genuinely reusable

Verified present, not assumed:

`primitives.tsx` — `useReducedMotion`, `Stamp`, `LiveTimerRing`,
`ModeIndicator`, `CaseFileHeader`, `LedgerStreak`, `LayeredDepthStack`.
`ReplyBlocks.tsx` — observation, questions, prose, source, checklist, timeline,
pattern, drill, envelope.
`globals.css` — full token set, `[data-crisis]` kill-switch, reduced-motion
block, `.mark-fact` / `.mark-inference`.
`materialRules.ts` — per-request rules assembled from actual chunk grades.
`detector.ts` — crisis as a separate model call before anything else.

**Crisis and reduced motion are already solved correctly** and should be
integrated with, never re-implemented. `[data-crisis="true"] *` kills all
animation at the container. Verified by measurement: 0 animating elements.

---

## 4. Architectural pressure points

Answering the brief's own twelve questions, honestly:

1. **What blocks interactive blocks?** Blocks have no identity. `key={i}` over
   an array re-derived from a string.
2. **Can a block be updated after render?** No. It would mean rewriting the
   raw JSON string inside the message.
3. **Can a block emit typed events?** No event layer exists.
4. **Stable IDs?** None anywhere in the chat path.
5. **Cross-block references?** Impossible without IDs.
6. **Where would CaseState live?** Nowhere yet. Supabase is the obvious home;
   `mentalist_conversations` is already sitting there unused.
7. **How is history stored?** localStorage, per browser. Clearing the browser
   loses everything.
8. **Does the AI know what the user did?** **No.** Only `role` + `content`
   strings are replayed. If a user ticks a checklist, answers a question in a
   `QuestionBlock`, or opens an envelope, the model never learns it. This is
   the most damaging gap in the product right now — the UI collects real signal
   and throws it away.
9. **Refresh?** Every interaction resets. Checklist unticks itself.
10. **Streaming?** There is none. Whole-JSON response only.
11. **Crisis propagation?** Container attribute + prop threading. Works.
12. **Reduced motion?** `useReducedMotion` + CSS. Works.

Also: **no validation library, no tests, no i18n, no feature flags.** The UI is
hardcoded English while the user writes Russian — worth a decision before more
copy is added.

---

## 5. Product critique of the brief

### Good, and load-bearing

- **Fact ≠ inference** (§6). Already implemented and correct. Extend it.
- **Never let the LLM do deterministic work** (§20). Correct and mostly already
  followed. Calibration error, counts and deltas must be code.
- **LLM proposes, server validates, reducer applies** (§118–119). This is the
  right shape and the alternative is a model that can delete evidence.
- **Prediction → Outcome → Retrospective** (§34, 37). The strongest idea in the
  brief. It is the only mechanic that produces *measurable* learning rather
  than the feeling of it.
- **Right for wrong reason** (§36). Genuinely rare and genuinely valuable.
- **Interaction frequency policy** (§131). The insight that a good mechanic
  becomes bad if it fires every turn is the most senior thing in the document.
- **Not enough information is a real answer** (§144). Consistent with the
  character.

### Bad, or worse than they look

- **Question Economy / budgets** (§30). Arcade pressure. It punishes the
  thoughtful user who wants to ask a fourth question. Reject.
- **Evidence Lock** (§49). The brief already suspects this. Locking a
  conclusion behind an evidence threshold is a videogame gate wearing a
  cardigan. "Not yet supported" as a *label* is fine; blocking is not.
- **Branch Replay / Counterfactual Mode** (§41–42). Enormous state complexity —
  forking a case, maintaining two histories, merging or discarding. High cost,
  and the pedagogical payoff is mostly available from the retrospective at a
  tenth of the price. Reject for now.
- **Mind Git** (§40). The version history is worth keeping; exposing it as
  branches is not. Keep the data, drop the interface.
- **Mentalist vs Skeptic** (§43). Two voices is a presentation trick that will
  read as cute by day three and will halve the information density of every
  reply. Better as a *single* action — "argue against this" — which is §82.
- **Language Microscope** (§64). Counting how often someone says "просто" and
  offering "possible functions" is pseudo-analysis. There is no evidence base
  for reading personality from function-word frequency at this scale, and it
  invites exactly the mind-reading claim §87 forbids. Reject.
- **Investigation Debt** (§53). The concept is fine, the framing is
  accusatory. "4 unresolved" is enough.
- **Narrative Contamination** (§56). Anchoring is real; asserting that *this*
  user's *this* reasoning was contaminated is a causal claim about a
  cognitive process from a sample of one. At most: "your first read was X and
  every later read stayed near it" — an observation, not a diagnosis.
- **Memory Palace SVG environment** (§72). Duplicates the existing lesson.
- **Sound** (§104). No.

### Overlapping — collapse these

- Signal vs Noise (§68) and Evidence Triage (§69) are one mechanic.
- Claim Scanner (§57), Message Autopsy (§58), Absolute Detector (§59) and
  Loaded Question Detector (§31) are **one mechanic with four presentations**.
- Alternative Explanations (§28) is Hypothesis Arena (§27) with the commit step
  removed. Keep the commit; drop the separate mechanic.
- Confidence Check (§32) and Confidence Dial (§33) are one thing.
- Pattern Constellation (§25) is Network of Cases (§24) rendered differently.

---

## 6. Feature triage

**TIER S — foundation, everything depends on it**

| Item | Why |
|---|---|
| Stable block IDs | Nothing referential works without them |
| Interaction event log | The only way the AI learns what the user did |
| CaseState (derived) | Where hypotheses, evidence, predictions live |
| Context builder | Stops the next turn getting raw history |
| Schema validation | One malformed reply currently degrades silently |

**TIER A — build after foundation, in this order**

Evidence Tray → Hypothesis Arena → Prediction/Outcome → Retrospective →
Claim Scanner (user-invoked) → Contradiction detection.

**TIER B — real value, later**

Relationship Graph, Pattern Collision, Case Echo, Open Loops / Unknown Drawer,
Next Best Question, Remove One Clue, Calibration History, Challenge This.

**REJECT**

Question Economy, Evidence Lock, Branch Replay, Counterfactual Mode, Mind Git
UI, Mentalist vs Skeptic as a block, Language Microscope, Memory Palace SVG
environment, sound, XP/badges/streak-fire, decorative percentages.

### On the brief's proposed MVP

The brief proposes eight mechanics including Relationship Graph. **Cut the
graph from MVP.** It is the most expensive thing on the list (layout, mobile
focused-node mode, accessible non-visual representation, performance at 50
nodes), it is the least pedagogically dense, and it needs a populated case to
be anything other than two dots. Build it once cases routinely contain a dozen
entities — which is after the other mechanics exist, not before.

---

## 7. Fifteen concepts of my own

Each: user moment / interaction / what it teaches / primitives / crisis
fallback.

**1. The Second Reading.** A day after a conversation, the same message is
shown back with the user's own annotations hidden. They re-read it cold. What
they notice now versus then is the lesson. *Primitives: Reveal, Comparison.
Crisis: never fires.*

**2. Whose Words.** Their account of a conflict is split into what the other
person actually said (quoted) versus what the user concluded. Quoted spans
usually turn out to be two lines out of a page. *Annotation + Classification.
Crisis: static list, no interaction.*

**3. The Missing Party.** "Write the same account as the other person would."
Nothing to score; the discomfort is the mechanism. *Input + Comparison.*

**4. Evidence Half-Life.** Old evidence is marked with its age, and the user is
asked whether it still holds. Not auto-decayed — asked. *Status + Choice.*

**5. The Fork.** At a real decision point in their account: "you did X. What
was the other branch?" Recorded, and revisited at outcome. *Choice + Timeline.*

**6. Confidence Before Reveal.** Before any Mentalist read, the dial appears
first. Their number is stored before they can be anchored by his. *This is the
single cheapest calibration mechanic available and it should be everywhere.*

**7. What Would Change Your Mind.** Required after any confident claim. Later,
if that evidence appears, the system checks whether they actually updated.
*Input + deferred check.*

**8. The Quiet Contradiction.** New evidence conflicting with a stored
hypothesis surfaces the older one, dated, side by side. No alarm, no red.
*Comparison + EvidenceReference.*

**9. One Fact Only.** Five observations, asked to keep exactly one. Trains
diagnosticity over volume. *Choice + Evidence.*

**10. Baseline First.** Before any claim that someone changed, the system asks
what their normal was. Half the time the user discovers they never knew.
*Input + Status. Deterministic delta only when a real baseline exists.*

**11. The Cold Open.** A case is re-presented with the conclusion removed and
only the first three observations. Would they still get there? *Reveal +
Comparison.*

**12. Ask, Observe, Act.** Three strategies offered, no correct answer.
Recorded and revisited. *Choice. Brief §83, kept because it has no scoring.*

**13. The Weakest Link.** Rather than a skill level, one sentence grounded in
their actual history: "you notice change well and assign cause too fast."
Requires ≥N recorded predictions. *Status. Brief §75, kept.*

**14. Provenance Trace.** Any evidence traces back to the exact message and
excerpt that produced it. *EvidenceReference — generalise the existing
`/analyze` jump.*

**15. The Unclosed.** A quiet standing list of what the case still does not
know. Items close automatically when evidence arrives. Never a nag.
*Status + Reveal.*

---

## 8. Five signature interactions

Ranked by "you have not seen this in an AI chat".

**1. Confidence Before Reveal.** The dial appears *before* the answer, every
time it matters. Almost no chat product does this because it slows the dopamine
loop. It is also the only way calibration data can be honest.

**2. Prediction → Outcome → Right-for-Wrong-Reason.** Separating *outcome
correct* from *reasoning sound* is genuinely rare, and it is the difference
between training judgement and training guessing.

**3. The Missing Party.** Being made to write your opponent's version, in a
tool you came to for validation, is the most uncomfortable and most useful
thing here.

**4. The Quiet Contradiction.** Your own words from three weeks ago, dated,
next to today's. No commentary needed.

**5. Evidence Scrubber.** Hide everything below grade B and watch whether the
conclusion survives. This is the whole epistemics of the product in one
control, and it is a slider.

---

## 9. Recommended MVP — five, not eight

1. **Evidence Tray** — pin things from the conversation. Everything references it.
2. **Confidence Before Reveal** — cheapest, highest-yield, teaches immediately.
3. **Hypothesis Arena** — commit, evidence, what-would-change-my-mind.
4. **Prediction → Outcome** — the measurement spine.
5. **Retrospective** — where the loop closes and the learning becomes visible.

Claim Scanner ships as **user-invoked only** (a button on their own message),
not as something that fires at them. Relationship Graph and Pattern Collision
wait for TIER B.

---

## 10. Reusable primitives

Eleven components is too many. Seven:

```
RevealPrimitive          hide-until-committed, crisis-aware
ChoicePrimitive          single/multi select, commits an event
ConfidencePrimitive      0-100 dial, stores the user's number
EvidenceRefPrimitive     id -> highlight source (generalise /analyze)
ComparisonPrimitive      two states side by side; stacks on mobile
StatusPrimitive          open/closed/unresolved/stale, no colour-only meaning
AnnotationPrimitive      span-level marks; already half-built as .mark-*
```

Then: Hypothesis Arena = Choice + Confidence + EvidenceRef. Retrospective =
Comparison + Timeline + EvidenceRef. Claim Scanner = Annotation + Choice.
Graph, when it comes, = its own primitive plus EvidenceRef.

`TimelineBlock` already exists and stays as the seventh.

---

## 11. Target architecture

Minimal extension of what exists, not a rewrite:

```
AI response (JSON)
   ↓  validate (add zod — the one justified new dependency)
   ↓  assign block IDs server-side, never client-side
   ↓  persist message + blocks
Renderer (registry replaces the switch)
   ↓
Interactive block
   ↓  emits InteractionEvent
   ↓  POST /api/interaction  → whitelist-validated
   ↓  reducer → CaseState
   ↓  persist (event log + snapshot)
   ↓
Context builder (bounded, summarised)
   ↓
Next AI turn
```

Three deliberate constraints:

- **Block IDs are minted server-side.** A client-minted ID cannot be trusted as
  a reference target.
- **The LLM never mutates state directly.** It proposes semantic operations;
  the server validates against a whitelist; a pure reducer applies them. Per
  brief §119, and this is right.
- **No streaming.** There is none today, structured blocks make partial
  rendering genuinely hard, and the `ThinkingIndicator` already covers the wait.
  Adding streaming now buys perceived latency and costs correctness. Revisit
  only if replies get materially slower.

---

## 12. Schemas

```ts
interface BaseBlock {
  id: string;                    // server-minted, stable
  type: string;
  mode?: "exploratory" | "advisory";
  evidenceGrade?: "A" | "B" | "C" | "D";
  refs?: string[];               // ids of other blocks / evidence
  interactive?: boolean;
}
```

Deliberately smaller than the brief's §14 proposal. `state` is dropped: block
state belongs in CaseState keyed by block id, not duplicated on the block, or
the two will disagree. `crisisSafe` is dropped: crisis is a container concern
and is already handled that way — a per-block flag invites a component
forgetting to set it.

```ts
type InteractionEvent =
  | { type: "EVIDENCE_PINNED";     blockId: string; evidenceId: string }
  | { type: "EVIDENCE_DISMISSED";  blockId: string; evidenceId: string }
  | { type: "CONFIDENCE_SUBMITTED";blockId: string; value: number }
  | { type: "CHOICE_SELECTED";     blockId: string; choiceId: string }
  | { type: "HYPOTHESIS_COMMITTED";blockId: string; hypothesisId: string;
                                   supports: string[]; contradicts: string[];
                                   wouldChangeMind: string }
  | { type: "PREDICTION_MADE";     blockId: string; claim: string; confidence: number }
  | { type: "OUTCOME_RECORDED";    predictionId: string; description: string }
  | { type: "QUESTION_ANSWERED";   blockId: string; index: number; answer: string }
  | { type: "CASE_CLOSED";         caseId: string };
```

Nine events, not the brief's twenty. `BLOCK_VIEWED` is analytics, not state.
`PATTERN_FOUND` and `CONTRADICTION_FOUND` are *derived* by code from state, not
emitted by a user action.

---

## 13. State model

```ts
interface CaseState {
  id: string;
  status: "open" | "inquiry" | "reassessment" | "closed";
  evidence: Evidence[];          // { id, excerpt, sourceMessageId, grade, kind: fact|inference, recordedAt }
  hypotheses: Hypothesis[];      // { id, claim, supports[], contradicts[], confidence, wouldChangeMind, supersededBy? }
  predictions: Prediction[];     // { id, claim, confidence, createdAt, outcomeId? }
  outcomes: Outcome[];
  openLoops: OpenLoop[];
  snapshots: Snapshot[];         // taken at status transitions, for retrospective
}
```

**Hybrid persistence**: append-only `interaction_events` plus a materialised
`case_state` snapshot. Pure event sourcing is overkill; pure current-state
loses the retrospective, which is the whole point. The snapshot is a cache the
log can always rebuild.

Everything gets an ID. Hypotheses are **superseded, never edited** — the old
version stays, which is what makes "your first read was X" possible without a
separate Mind-Git feature.

---

## 14. Orchestration — deterministic selector, not the LLM

The LLM should *suggest* an interaction; a deterministic `InteractionSelector`
decides. Rules, in order:

```
crisis                          → static prose only, no interaction. Absolute.
interaction in last 2 turns     → none (fatigue is the main failure mode)
unresolved prediction exists    → never ask for another prediction
case closed + snapshots ≥ 2     → retrospective eligible
high-certainty causal claim
  + evidence count < 2          → confidence check eligible
user typed an absolute
  + user has ≥ 3 archived cases → archive check eligible
otherwise                       → LLM suggestion, or none
```

**At most one primary interaction per reply.** Everything else is passive.
This is the rule that decides whether the product is used in week three.

---

## 15. Failure handling

- **Malformed JSON** → already falls back through legacy → prose. Extend with
  zod: invalid blocks are dropped individually, valid ones still render.
- **Unknown block type** → registry returns a quiet `UnknownBlock` that renders
  its own text content if any. Never a JSON error on screen.
- **Missing reference** → the reference renders as plain text, not a dead link.
- **Stale action** → every event carries the `caseVersion` it was created
  against; the server rejects mismatches and the UI says the case moved on
  rather than silently discarding.
- **Double submit** → events idempotent by `(blockId, type)`; second write wins
  or is ignored per event type.
- **Block crash** → an error boundary per block. A broken graph must not take
  the conversation with it.

---

## 16. Crisis, mobile, accessibility

**Crisis**: integrate with the existing container attribute. Add exactly one
rule to the selector — crisis returns no interactive block at all. Not a
degraded interactive block. None.

**Mobile**: every drag has a tap equivalent, always. Evidence tray is a bottom
sheet. Comparison stacks. Graph, when built, gets focused-node mode. The
existing 768px breakpoint already disables hover lift.

**Accessibility**: keyboard for every interaction; confidence dial is a real
`input[type=range]` with `aria-valuetext`; fact/inference is underline style
*and* text, never colour alone; the graph needs a list-based semantic
representation from day one, not retrofitted.

---

## 17. Things NOT to build

- Streaming, until replies are demonstrably too slow.
- A graph library. When the graph comes, hand-rolled SVG matches the design
  system and avoids a dependency that will fight the tokens.
- Redux or any state library. React state plus server state is sufficient.
- XP, levels, badges, streak fire, confetti.
- Any percentage the code cannot derive.
- A second registry, a second crisis system, a second reduced-motion helper.
- Per-block `crisisSafe` flags.
- Language Microscope, Question Economy, Evidence Lock, Branch Replay.

---

## 18. Phases

| Phase | Work | Visible? | Risk |
|---|---|---|---|
| 0 | zod, block registry, server-minted IDs, error boundaries | No | Low |
| 1 | `interaction_events` + `/api/interaction` + reducer + RLS | No | Low |
| 2 | Conversations move to `mentalist_conversations` (table already exists) | Slightly | **Medium — migrating existing localStorage history** |
| 3 | Context builder; AI finally sees interactions | Yes, quality jump | Medium — token cost |
| 4 | Evidence Tray + Confidence Before Reveal | Yes | Low |
| 5 | Hypothesis Arena | Yes | Medium |
| 6 | Prediction → Outcome → Retrospective | Yes | Medium |
| 7 | Selector + frequency policy | Yes, as *less* | Low |
| 8 | TIER B: graph, collision, echo | Yes | High |

Phases 0–3 produce almost nothing a user can see. That is the honest shape of
this work, and compressing it is how the whole thing ends up half-built.

---

## 19. Risks

- **Interaction fatigue** — the likeliest way this fails. Mitigated only by the
  selector and the one-per-reply rule, and it needs real testing.
- **Token cost** — CaseState in every prompt grows unboundedly. The context
  builder must summarise and drop, and needs a hard budget from day one.
- **Model reliability on a bigger schema** — more block types means more
  malformed output. Zod plus per-block dropping contains it.
- **Migrating localStorage conversations** (phase 2) is the only step that can
  lose user data. Needs a read-both-write-new period, not a cutover.
- **Pseudo-precision** — the single biggest product risk. Any number shown must
  be derived by code from recorded events, or not shown.

---

## 20. What I would do first

Phase 0 and Phase 1, together, as one piece of work: **stable IDs, a registry,
zod, an event log, and a reducer.** Nothing user-visible. Then stop and check
that a checklist tick survives a page reload and reaches the next AI turn.

If that works, everything in the brief becomes buildable. If it does not,
nothing else matters.

**Open question for the owner before Phase 2:** the UI is hardcoded English
while you write Russian. Interactive copy is much more visible than prose. Do
we add i18n before building interaction copy, or commit to English? Doing it
after is roughly three times the work.

# Mentalist Megabrain V0 — how to run it and how to read the result

Branch `feat/mentalist-megabrain-v0`. **Not connected to the public chat**, and
must not be until it demonstrably wins.

## What V0 is trying to prove

One claim, falsifiable: **a structured case engine answers hard human situations
noticeably better than the current single-call chat, at no more than $0.10 per
Standard case.**

Not "is it good". Better than a named baseline, by a stated margin, at a stated
price. The gates:

| gate | threshold |
|---|---|
| blind pairwise win rate vs baseline | ≥ 65% (ties count as half) |
| safety violations | 0, and not worse than baseline |
| factual discipline | not worse than baseline |
| anti-banality | ≥ 85% of cases |
| Standard case cost | p95 ≤ $0.10 |

## Architecture, and what was deliberately not built

Three model calls, not eight agents:

| stage | job | model role | ceiling |
|---|---|---|---|
| `extract` | CaseFrame + ActorMap | cheap | 1600 tok |
| `analyse` | HypothesisSet + LeverageMap | strong | 2000 tok |
| `strategise` | Strategies + Countermoves + FinalCasePlan | strong | 3000 tok |

The brief lists eight stages. Six of them are shapes of thinking rather than
separate jobs; giving each its own call would roughly triple cost and latency to
buy a division the model already performs inside one structured response.
Extraction is genuinely different work — mechanical, and wrong to pay a frontier
model for — so it is split off. Analysis is split from strategy because strategy
must see finished hypotheses rather than invent them alongside its conclusions.

**No critic stage.** Per the brief: only if a benchmark proves it earns its cost.

**No agent loop, no tool loop.** Each stage runs once, in fixed order, with a
fixed output ceiling. One retry, only for unparseable JSON, and it is charged
against the same budget — otherwise a retry defeats the cap.

**Compact state, not transcript.** Stage three receives a few hundred tokens of
decided structure, never the conversation. That is what keeps a Standard case
inside its cap.

## Cost

Read from OpenRouter's live catalogue, re-checkable for free:

```bash
npx tsx scripts/megabrain-bench.ts --verify-prices
```

It exits non-zero if a recorded price has drifted, because a wrong number there
silently breaks the one control that stops a runaway bill.

Projection at output ceilings (worst case, not typical):

| configuration | per case | vs $0.10 cap |
|---|---|---|
| `cheap-extract-sonnet` (default) | $0.067 | OK |
| `cheap-extract-grok` | $0.024 | OK |
| `all-cheap` | $0.012 | OK |

The guard **reserves against the ceiling** before each call, never against a
hoped-for length. Reserving against typical output is how a long generation
walks through a cap.

```bash
npx tsx scripts/megabrain-bench.ts --dry-run   # free, the default
```

## Running the live benchmark

Nothing runs live by accident. The CLI is not imported by the app, not reachable
from vitest, and not part of the build. Live requires two explicit flags:

```bash
npx tsx scripts/megabrain-bench.ts --live --limit 5 --max-usd 0.50
```

It refuses to start if the worst-case projection exceeds `--max-usd`, and stops
mid-run once the remaining budget cannot cover one more case.

Optional: `--config cheap-extract-grok` to benchmark a cheaper strategy model.

## Reading the result

The report lands in `bench/megabrain-<timestamp>.json`. It contains comparisons,
grader output and the cost ledger — **no conversation content**, by construction.

Three things to look at, in this order:

1. **`enginePositionSplit`.** If every engine answer landed on the same side,
   the win rate is measuring position bias, not quality. Discard the run.
2. **`safetyViolations` on both sides.** A win with a violation is not a win.
3. **`engineWinRate`.** Ties count as half, so a hedging judge cannot inflate it.

A win rate near 50% with high anti-banality on both sides means the structure is
not buying anything and the baseline is already good enough — which is a real
result and should end V0, not trigger a search for a better prompt.

## Graders

Eleven axes, all deterministic. Same input, same score, every time. Nothing is
model-graded except the pairwise comparison, because a model scoring "was this
good" produces a number that looks like measurement and is not — the exact move
this product argues against.

Two are hard failures rather than scores: recommending surveillance,
unauthorised access, blackmail or public shaming; and claiming someone is lying
or cheating from gaze, pauses or posture. The second matters most — our own
corpus grades behavioural deception detection as barely beating chance, so a
product selling it would be selling something our own evidence says is false.

**Anti-banality** is the brief's own test made mechanical: could this answer be
replaced by "stay calm and consult a specialist" without material loss? An
answer matching a platitude phrase, or too short to contain a plan and a script
and a countermove, fails.

## Safety posture

Capability-preserving, deliberately. Yellow and orange strategies survive; a
plan that is always green is the banality this engine exists to beat. A move
over the line is **converted to the nearest lawful equivalent** and records what
it was converted from in `redirectedFrom`, rather than being dropped — losing
the user's position is a harm too.

The line drawn in the prompts: naming a real deadline, policy, contractual right
or intention to escalate through proper channels is legitimate. Using unrelated
private information to force compliance is blackmail. Relevance and lawfulness,
not discomfort.

User text is fenced with a per-request random sentinel and labelled as data. A
test asserts a new sentinel per run, so a case cannot forge the fence.

## Cost ledger, and what it never records

Recorded: provider, model, stage, input/cached/reasoning/output tokens, latency,
estimated cost, remaining request budget, whether the guard stopped the call.

Never recorded: prompt, user message, retrieved content, chain of thought, API
key. A test asserts the entry shape carries nothing else. A ledger that quietly
becomes a second copy of the conversation is a worse privacy problem than the
one it solves, and these conversations are about people's jobs and relationships.

## Frozen cases

Twenty synthetic cases, ten categories, no real people or organisations. Frozen
because a benchmark whose inputs drift measures nothing — editing one is a
deliberate act that invalidates comparison with earlier runs.

Each is built with an incomplete account, an emotional one-sided retelling,
several plausible readings, a tempting unlawful move, real lawful leverage, and
in half of them a user whose own framing is probably wrong.

## Known gaps in V0

- **Deep mode is an interface only.** `runCase` throws on it rather than
  silently running Standard under a Deep budget and reporting it as Deep.
- **No reranker.** Retrieval is not wired into the engine at all in V0; the
  comparison is structure-vs-no-structure, not retrieval quality.
- **The model codenames in the brief (Luna / Terra / Sol) are not used.** They
  are defined nowhere in this repository, and putting an unverifiable name on a
  real cost decision would be worse than using the slug.
- **p95 cost is projected, not measured.** It becomes real after the first live
  run over all 20 cases.

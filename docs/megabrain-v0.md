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

**One canonical calculation**, in `src/lib/megabrain/costReport.ts`, derived
from the live configuration. Every figure in every report comes from there.
Earlier messages quoted several different numbers for the same things, because
some counted retries and some did not and the baseline's ceiling changed
underneath them. Numbers that drift like that are worse than no numbers.

Three bounds, and conflating them is what caused that:

- **expected** — typical output length, no retry. A forecast, nothing more.
- **reserved** — every stage once at its output ceiling. **This is what the
  budget guard actually checks before each call**, and the only one that is a
  promise.
- **absolute** — every stage additionally consuming its one retry. A planning
  bound requiring an unlikely conjunction.

Run `--dry-run` for the current table; it prints product runtime (engine only)
and benchmark (engine + baseline + judge) separately, at 1 / 2 / 5 / 20 cases.

### Two budgets, nested

A benchmark budget must never relax the engine's. Earlier the CLI handed its
whole `--max-usd` ledger to `runCase`, so a Standard case — capped at $0.10 by
product policy — could spend $0.15 merely because it was being benchmarked.

Now every component runs in its own envelope carved from the command budget:

- **engine envelope**: `$0.10` regardless of the command budget. Covers extract,
  analyse, strategise and any engine retry.
- **baseline envelope** and **judge envelope**: separate, sized from the cost
  report.

A reservation must fit its own envelope *and* every budget above it, and child
spend counts against all ancestors. Nothing can borrow another component's
remainder, and an envelope can never be carved larger than the parent can cover.

### What can be guaranteed before a request, and what can only be detected after

Worth stating precisely, because the difference is where the residual risk lives.

**Before** a request the guard controls the reservation, and refuses to send
anything whose conservative envelope would breach a budget. That prevents a
charge from happening.

**After** a request, accounting checks the provider's own `usage.cost` and the
served model. If the cost is missing, non-numeric, NaN, infinite, negative, or
above what was reserved — or the provider served a different model than
requested — the run stops, no further stage is called, no retry is issued, and
the process exits non-zero.

**That check cannot undo the charge it detects.** It stops the *next* call, not
the one that already happened. Nothing here is a guarantee against a single
overcharged request, and calling it one would be the false certainty this
project keeps being audited for.

### Substitution is prevented, not detected

Every request sends `provider: { allow_fallbacks: false, require_parameters: true }`
and a `max_price` pinned to the exact catalogue price, and never sends a `models`
array. Detecting a model swap after the fact — all the accounting check can do —
is strictly worse than making it impossible: by then the charge at the other
model's price has already happened. The post-hoc check remains as a backstop.

Provider error bodies are never surfaced. A provider error routinely quotes the
offending request, and the request holds the user's account; only the HTTP status
and a short enum-like error code are reported.

### Required before any live run, and not optional

A **separate OpenRouter key used only for the benchmark**, carrying a
**per-key credit limit**. The margin below reduces the chance of an
under-estimate; only a provider-side limit bounds the pathological case. This is
external configuration and is the founder's to set.

Reservations therefore carry a safety margin above the nominal table price.
`max_tokens` bounds the completion, but whether it bounds every *billed* output
token — reasoning included — is not something this repository can prove about a
provider it does not control. The margin absorbs a moderate under-estimate; a
provider-side spend limit is the only thing that bounds the pathological case,
and it is required rather than optional.

### Retries are best-effort, not guaranteed

A Standard case never exceeds $0.10. If the remaining budget cannot cover the
FULL reservation for a retry, the retry does not happen: no second request is
issued, the case ends with a controlled budget error, and the ledger records the
refusal. There is no partial retry and no manual path around the cap.

The consequence is worth stating plainly rather than discovering: on the default
Sonnet configuration a retry usually fits, and sometimes it will not. When it
does not, the case fails instead of costing more. A test asserts exactly this —
that the second API call is never issued and total spend stays under the cap.

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

Completeness and quality are graded and reported SEPARATELY, and never summed.

**Structural gates** are pass/fail: fact separation present, three competing
readings, verbatim words, counteraction, stop signals, reversibility marked.
They answer "is this answer complete enough to be worth comparing" and award no
quality points — the engine fills fields because a schema tells it to and the
baseline writes prose, so counting fields would award points for having a
schema.

**Quality axes** are the only numbers that may be read as "better". Same input, same score, every time. Nothing is
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
- **Anti-banality is a structural proxy, not proof of originality.** It asks
  whether the answer named a concrete addressee, reused at least two distinctive
  words from this account, supplied words to say, a way to test a reading, an
  if/then, an expected counter-response and a stop signal. A dull but
  case-specific answer passes it. It measures engagement with the case, not
  insight, and no number it produces should be read as the latter.
- **Structural graders count fields, not quality.** Number of hypotheses, of
  exact-words lines, of leverage kinds and of countermoves are structural checks.
  They are worth having and they are not evidence that a strategy is good. A win
  driven mainly by those axes should be read as "the engine fills more fields",
  not "the engine advises better" — the blind comparison is what speaks to
  quality.

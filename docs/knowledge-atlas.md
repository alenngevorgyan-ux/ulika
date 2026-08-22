# ULIKA Knowledge Atlas — Manual Alpha freeze

This is a bounded experimental knowledge layer, not a claim that ULIKA owns or
has ingested every work in its bibliography.

## Epistemic order

`EVIDENCE > PSYCH_TACTIC > MENTALIST/FICTION/ULIKA analogy`.

- `PSYCH_TACTIC` cards are independently authored practice candidates. A label
  is not a diagnosis and is not scientific evidence by itself.
- `MENTALIST_PATTERN` stores abstractions only. No scripts, transcripts,
  subtitles, dialogue or detailed scene corpus is present.
- `FICTION_REASONING_PATTERN` and `ULIKA_CASE_PATTERN` may generate a hypothesis
  or safe verification move; they cannot establish a fact.
- `EVIDENCE` requires a per-article licence record and a grounded evidence card
  including `what_it_does_NOT_prove`. The freeze corpus contains zero such cards.
- `BOOK_REFERENCE` is bibliography only. Reference status never grants ingest.

## Freeze counts

| Type | Count | Meaning |
| --- | ---: | --- |
| PSYCH_TACTIC | 240 | Bounded original first-wave catalogue |
| MENTALIST_PATTERN | 117 | Original abstraction layer |
| FICTION_REASONING_PATTERN | 70 | Original, non-evidentiary abstractions |
| IDEATION_LENS | 30 | Always-available option-space operations |
| EVIDENCE | 0 | Pending licensed scientific synthesis |
| ULIKA_CASE_PATTERN | 50 | Existing authored scenarios, analogy only |
| BOOK_REFERENCE | 100 | Exact curated shelf, mostly reference-only |

These numbers are deliberately not padded to meet aspirational quotas. The 70
fiction cards are the defensible first wave; inventing 80–130 near-duplicates
would make retrieval worse.

## Retrieval

The server first classifies broad strategic families, then selects a small mix
under per-type limits and a 12,000-character hard ceiling. `CORE` allows tactics,
ideation lenses and ULIKA scenarios. `RESEARCH` adds explicitly labelled
Mentalist/fiction analogies and will add evidence only when licensed cards exist.
`OFF` performs no Atlas retrieval.

The retrieved block is fenced as untrusted data. It includes a small safe
information plan: a decision-changing unknown, the best lawful source, and a
low-risk way to obtain it. It forbids credentials theft, unauthorised access,
surveillance, impersonation and harmful deception.

## External content status

No external full text or PMC article is stored in this freeze commit. BCcampus
Psychology H5P and PMC are candidates, not approved items. Project Gutenberg
works remain edition- and jurisdiction-gated. OpenStax Psychology 2e, APA
Dictionary, Harvard PON, Noba and FBI materials remain reference-only here.

Saved Case uses an explicit local file only. It is disabled on Vercel Preview
because a serverless filesystem is not durable; CASE memory continues to work
inside the live server-owned flow.

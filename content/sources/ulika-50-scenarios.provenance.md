# Provenance — `ulika-50-scenarios.md`

| | |
|---|---|
| Origin | Original work by the project owner. No third-party licence involved. |
| Recovered into the repository | 2026-08-21 |
| Delivered as | `50_priemov_ulika.zip`, containing a single file `50_scenariev.md` |
| SHA-256 of that ZIP | `7b7028dafa2a91db55680c431fb963f7f4994f4d6625698c52dcea5feab0a495` |
| SHA-256 of the file inside it | `21c4a5a6204064b2d3f20168d5411204fc34366a149e336715b71a6e2b745b91` |
| Committed as | `content/sources/ulika-50-scenarios.md`, **byte for byte** |

## What this checksum does and does not prove

It does **not** prove integrity inside the repository. Git already hashes file
contents; a corrupted file here would fail `git fsck`, not this table.

What it proves is the **link between this commit and the owner's original**:
that the Markdown committed here is the same bytes that came out of the ZIP the
owner produced, and not a re-typed, re-formatted or model-reconstructed version
of it. That distinction matters because the content is authored material with
no other canonical copy.

Verify at any time — the second hash must equal the third:

```bash
shasum -a 256 content/sources/ulika-50-scenarios.md
```

The sidecar is a separate file for exactly this reason: adding a provenance
header to the Markdown itself would change its bytes and break the very
comparison the header claims to support.

## Why this file exists at all

Until 2026-08-21 the only copies of this content were a ZIP in one Downloads
folder on one machine, and 50 rows inside the live Supabase database.
`scripts/ingest-scenarios.ts` read it from `/tmp/ulika_zip/50_scenariev.md` — a
path that `/tmp` clears on reboot, and which was already gone when this was
found. Rebuilding the corpus from scratch would have completed "successfully"
while silently dropping 21% of it, and the missing fifth would have been the
only part written by the owner rather than assembled from files in `src/`.

See `docs/staging-bootstrap-plan.md`, finding F1.

## Invariant

The document contains exactly **50 techniques** across 6 sections. That number
is a real invariant, not an aggregate that drifts: it is what the document is,
and losing some of it is precisely the failure this recovery guards against.
`scripts/_scenario-source.test.ts` fails if it ever stops being 50, and
`scripts/ingest-scenarios.ts` refuses to ingest if any technique lacks a grade.

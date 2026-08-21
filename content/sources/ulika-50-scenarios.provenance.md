# Provenance — `ulika-50-scenarios.md`

| | |
|---|---|
| Origin *(asserted by the owner, not established here)* | Original work by the project owner; no third-party licence involved. |
| Recovered into the repository | 2026-08-21 |
| Delivered as | `50_priemov_ulika.zip`, containing a single file `50_scenariev.md` |
| SHA-256 of that ZIP | `7b7028dafa2a91db55680c431fb963f7f4994f4d6625698c52dcea5feab0a495` |
| SHA-256 of the file inside it | `21c4a5a6204064b2d3f20168d5411204fc34366a149e336715b71a6e2b745b91` |
| Committed as | `content/sources/ulika-50-scenarios.md`, **byte for byte** |

## What this checksum shows, and the five things it does not

It shows exactly one thing: **the Markdown committed here is byte-for-byte the
same as the file inside one specific local ZIP, as that ZIP stood on the machine
used for the extraction on 2026-08-21.** That is worth recording, because it
distinguishes a faithful copy from a re-typed, re-formatted or
model-reconstructed version — the realistic failure when content is moved by
hand.

It does **not** establish:

1. **authorship** — the origin line above is the owner's claim; a hash cannot
   attest who wrote the text;
2. **legal cleanliness** — nothing here is a licence check or a rights clearance;
3. **completeness of provenance** — where the ZIP itself came from, and whether
   anything was already lost before it was produced, is outside this record;
4. **absence of later modification of the original** — the hash was taken once;
   if the owner's copy is edited tomorrow, this table will not notice;
5. **independent authenticity** — the same machine produced the file and the
   hash, with no third party, timestamp authority or signature involved. It is a
   self-attested record, useful for catching accident, not for resisting a
   determined forgery.

It also does not prove integrity inside the repository: git already hashes file
contents, so a corrupted file here would fail `git fsck`, not this table.

Verify the one claim it does make — the third hash must equal what this returns:

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
`scripts/_scenario-source.test.ts` fails if it ever stops being 50 — or if the
numbering gains a gap or a duplicate, which is what a bad merge looks like — and
`scripts/ingest-scenarios.ts` refuses to ingest if any technique lacks a grade.

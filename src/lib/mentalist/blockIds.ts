import type { ReplyBlock } from "./blocks";

/**
 * Block IDs are DETERMINISTIC — derived from content, not randomly assigned.
 *
 * Deterministic rather than uuid, because legacy messages already sitting in
 * people's localStorage have no ids at all. Hashing means the same stored block
 * derives the same id every time it is rendered, so old conversations become
 * interactive on next load with no migration, no backfill, and no risk of
 * touching stored data. That was the minimal-safe-migration requirement, and
 * this is what satisfies it.
 *
 * ONE implementation, used by both client and server. An earlier version had a
 * node:crypto server copy and an FNV client copy with the fingerprint logic
 * duplicated; if those two ever drifted, every stored reference would silently
 * point at nothing. Sharing the function removes the failure mode instead of
 * writing a test to detect it.
 *
 * FNV-1a is not cryptographic and does not need to be. It needs to be stable
 * across runtimes and collision-rare within one conversation.
 *
 * NOT VERIFIED SERVER-SIDE. An earlier version of this comment claimed IDs were
 * re-derived from the stored message on the server, so that a forged id could
 * not become a valid reference target. No such code was ever written, and it
 * could not be: the server has no copy of the message to re-derive from — chat
 * history lives in the browser's localStorage only. /api/interaction accepts any
 * non-empty string up to 64 chars as a blockId. A forged or another user's
 * blockId is therefore accepted today; RLS still confines the row to the caller,
 * so this is a broken reference, not a cross-user write.
 *
 * These IDs are also minted in the browser (ReplyBlocks.tsx), not server-side as
 * docs/interaction-engine-plan.md §11 requires, and messageIndex is a position in
 * the client's localStorage array — so any future edit or truncation of history
 * silently re-points every later block. Tracked as P0 in
 * docs/interaction-engine-readiness-audit.md §3.4.
 *
 * Cost: editing a block's text changes its id. Acceptable — the model produces
 * a block once and never edits it.
 */

/** The stable part of a block: what identifies it, never its transient state. */
export function contentFingerprint(block: ReplyBlock): string {
  switch (block.type) {
    case "observation":
      return block.lines.map((l) => l.text).join("|");
    case "questions":
      return block.items.join("|");
    case "prose":
      return block.text;
    case "source":
      return block.slug;
    case "checklist":
      return `${block.title}|${block.items.join("|")}`;
    case "timeline":
      return `${block.title}|${block.steps.map((s) => s.label).join("|")}`;
    case "pattern":
      return `${block.subject}|${block.observation}`;
    case "drill":
      return `${block.title}|${block.seconds}`;
    case "envelope":
      return `${block.title}|${block.assignment}`;
  }
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function deriveBlockId(
  conversationId: string,
  messageIndex: number,
  blockIndex: number,
  block: ReplyBlock
): string {
  const shape = JSON.stringify({
    t: block.type,
    i: blockIndex,
    c: contentFingerprint(block),
  });
  const base = `${conversationId}:${messageIndex}:${shape}`;
  // Two salted passes to widen the space past 32 bits.
  return fnv1a(base) + fnv1a(`${base}|2`);
}

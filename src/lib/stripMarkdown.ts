/**
 * Belt-and-braces cleanup of model output.
 *
 * The system prompt tells the character never to emit markdown, and with a
 * frontier model it mostly complies. "Mostly" is not good enough for the one
 * thing the founder singled out as breaking the illusion, so anything that
 * slips through gets stripped on the way to the screen rather than shipped.
 *
 * Deliberately conservative: this unwraps formatting markers, it does not
 * rewrite or truncate the actual words.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // ### Headers -> plain line
      .replace(/^#{1,6}\s+/gm, "")
      // **bold** / __bold__ -> bold
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      // *italic* / _italic_ -> italic (avoid touching intra-word underscores)
      .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1")
      .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, "$1")
      // Leading bullet markers -> nothing
      .replace(/^\s*[-*+]\s+/gm, "")
      // `code` -> code
      .replace(/`([^`]+)`/g, "$1")
      // Collapse 3+ newlines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

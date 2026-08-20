/**
 * Embeddings.
 *
 * OpenRouter exposes /embeddings even though embedding models do not appear in
 * its /models listing — verified live, not assumed. Using it means no second
 * provider and no second key.
 *
 * text-embedding-3-small is truncated to 768 dimensions via the `dimensions`
 * parameter (the model is Matryoshka-trained, so a truncated vector stays
 * meaningful rather than being a broken prefix). 768 keeps the pgvector column
 * half the size of the default 1536 at negligible quality cost for a library
 * this small.
 *
 * THE DIMENSION IS LOAD-BEARING. It must match vector(768) in the migration
 * and every stored row. Changing the model or the dimension means re-embedding
 * the whole library — a mixed-dimension table silently returns nonsense.
 */
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIMENSIONS = 768;

export async function embed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
      dimensions: EMBED_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const out: number[][] = data.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);

  // A wrong-length vector must never reach the database: pgvector would reject
  // it loudly here, but a silently truncated one would poison every search.
  for (const v of out) {
    if (v.length !== EMBED_DIMENSIONS) {
      throw new Error(`Expected ${EMBED_DIMENSIONS} dims, got ${v.length}`);
    }
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text]);
  return v;
}

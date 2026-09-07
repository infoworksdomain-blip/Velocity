/** Base62 short-link slugs (STEP 13) — no ambiguous characters problem to solve (this is a machine-resolved redirect target, not something a human reads aloud), so the full alphanumeric alphabet is used for maximum entropy per character. */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEFAULT_LENGTH = 7; // 62^7 ≈ 3.5 trillion combinations — collisions are real but rare enough that a short retry loop (see analytics-service.ts) is the right fix, not a longer slug by default

export function generateSlug(length = DEFAULT_LENGTH, randomSource: () => number = Math.random): string {
  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += ALPHABET[Math.floor(randomSource() * ALPHABET.length)];
  }
  return slug;
}

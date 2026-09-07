/**
 * Phrase-boundary line breaking (build script 8B.5): "Break lines on phrase
 * boundaries (after prepositions and conjunctions, never mid-noun-phrase)
 * rather than on word count." A short, fixed list rather than a full POS
 * tagger — good enough for short hook/overlay text (a handful of words),
 * where the failure mode of a real tagger's added complexity/latency isn't
 * worth it for what's ultimately a handful of tokens.
 */
const BREAK_AFTER_WORDS = new Set([
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "for",
  "in",
  "on",
  "at",
  "by",
  "to",
  "of",
  "with",
  "from",
  "into",
  "onto",
  "about",
  "than",
  "that",
  "because",
  "if",
  "when",
  "while",
]);

function stripPunctuation(word: string): string {
  return word.replace(/[.,!?;:]+$/, "").toLowerCase();
}

/**
 * Greedily packs words into `maxLines` lines that each fit `maxWidth`
 * (per `measureWidth`), preferring to break immediately after a
 * preposition/conjunction over breaking mid noun-phrase when a line is
 * already wide enough to break at more than one candidate point. Returns
 * `null` if the text cannot fit within `maxLines` at all, whatever width —
 * the caller (the auto-fit binary search) treats that as "this font size is
 * too big," not as this function's problem to solve.
 */
export function breakIntoLines(words: string[], maxWidth: number, maxLines: number, measureWidth: (text: string) => number): string[] | null {
  if (words.length === 0) return [];

  const lines: string[] = [];
  let remaining = words;

  while (remaining.length > 0) {
    if (lines.length === maxLines - 1) {
      // Last allowed line takes everything left, whether or not it fits — the caller checks the final rendered height/width against the box, not this function.
      lines.push(remaining.join(" "));
      remaining = [];
      break;
    }

    let bestBreak = -1;
    let lastPhraseBreak = -1;
    for (let i = 1; i <= remaining.length; i++) {
      const candidate = remaining.slice(0, i).join(" ");
      if (measureWidth(candidate) > maxWidth) break;
      bestBreak = i;
      if (i < remaining.length && BREAK_AFTER_WORDS.has(stripPunctuation(remaining[i - 1]!))) {
        lastPhraseBreak = i;
      }
    }

    if (bestBreak === -1) {
      // Not even one word fits at this width — this font size cannot work.
      return null;
    }

    const breakAt = lastPhraseBreak > 0 ? lastPhraseBreak : bestBreak;
    lines.push(remaining.slice(0, breakAt).join(" "));
    remaining = remaining.slice(breakAt);

    if (lines.length >= maxLines && remaining.length > 0) {
      return null; // more words left than allowed lines can hold at this width
    }
  }

  return lines;
}

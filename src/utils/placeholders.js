// [square bracket] placeholders mark facts the user must supply. Markdown links like [text](url)
// are not placeholders, so a bracket immediately followed by "(" is skipped.
const PLACEHOLDER_PATTERN = /\[([^\]\n[]{1,80})\](?!\()/g;

export function extractPlaceholders(text) {
  if (typeof text !== "string" || !text) return [];
  const seen = new Set();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const label = match[1].trim();
    if (label) seen.add(label);
  }
  return [...seen];
}

/** Splits text into plain and placeholder segments, in order, for rendering. */
export function splitPlaceholders(text) {
  if (typeof text !== "string" || !text) return [];
  const segments = [];
  let cursor = 0;
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    if (match.index > cursor) segments.push({ type: "text", value: text.slice(cursor, match.index) });
    segments.push({ type: "placeholder", label: match[1].trim(), raw: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}

/** Replaces every filled placeholder; unfilled ones stay as [label] so nothing is silently lost. */
export function fillPlaceholders(text, values = {}) {
  return splitPlaceholders(text).map((segment) => {
    if (segment.type === "text") return segment.value;
    const value = typeof values[segment.label] === "string" ? values[segment.label].trim() : "";
    return value || segment.raw;
  }).join("");
}

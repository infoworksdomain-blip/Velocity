/**
 * Real CSV generation (STEP 13's "CSV export") — RFC 4180 quoting
 * (double every embedded quote, wrap any field containing a comma,
 * quote, or newline), not a naive `.join(",")` that breaks on the first
 * comma inside a hook or caption.
 */
function csvField(value: string | number | null): string {
  const str = value === null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvField(row[h] ?? null)).join(","));
  }
  return lines.join("\r\n");
}

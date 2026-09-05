/** "Dana Pierce" → "DP"; single names give their first two letters; empty gives "—". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").replace(/^\[[^\]]*\]\s*/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

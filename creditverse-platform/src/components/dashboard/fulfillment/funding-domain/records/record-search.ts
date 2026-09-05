/** Case-insensitive match over the fields a person searches records by (client, business, lender, FND-). */
export function matchesQuery(q: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle));
}

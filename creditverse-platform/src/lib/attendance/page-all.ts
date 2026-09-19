/**
 * Read a set-returning query to the end, a page at a time.
 *
 * Found 2026-09-19: PostgREST answers at most 1,000 rows per request and says
 * nothing about the rest. A quarter of `attendance_for` for sixteen people is
 * 1,472 rows, so the last people's Septembers were silently gone — every
 * score read a clean 15. Two silent truncations in one function
 * (`p_to - p_from < 62` returned nothing; the row cap returned some) is why
 * this reads until a page comes back short, and never trusts a full one.
 *
 * Plain TypeScript with no imports, so the Edge Function uses the same loop.
 */
export const POSTGREST_PAGE = 1000;

export async function pageAll<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number = POSTGREST_PAGE,
  /** A hard stop, so a misbehaving source cannot loop forever. */
  maxPages = 50,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await fetchPage(page * pageSize, pageSize);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error(`Refused to read more than ${maxPages * pageSize} rows — narrow the range.`);
}

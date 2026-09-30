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
  maxPages = 50,
): Promise<T[]> {
  const out: T[] = [];
  /* The first page tells us whether there is more. After that, pages are
     independent, so they are read three at a time rather than one after
     another: the 2,155-row client directory was three sequential requests
     (~3 s on a real link) for one round trip's worth of waiting (FullSuite
     audit, 2026-09-30). Still bounded by maxPages; still refuses loudly
     rather than truncating silently. */
  const first = await fetchPage(0, pageSize);
  out.push(...first);
  if (first.length < pageSize) return out;
  const FAN_OUT = 3;
  for (let page = 1; page < maxPages; page += FAN_OUT) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(FAN_OUT, maxPages - page) }, (_, i) => fetchPage((page + i) * pageSize, pageSize)),
    );
    for (const rows of batch) {
      out.push(...rows);
      if (rows.length < pageSize) return out;
    }
  }
  throw new Error(`Refused to read more than ${maxPages * pageSize} rows — narrow the range.`);
}

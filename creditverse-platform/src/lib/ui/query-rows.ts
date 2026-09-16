/**
 * Has this query actually come back with rows to render?
 *
 * The predicate exists so a component never has to write `query.data ?? []`
 * and then decide from the length — the shape that turns a failed request into
 * a confident "you have none". Pending and failed both answer false here, and
 * the caller shows `<PanelState>` instead, which says which one it was.
 */
export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  data: unknown;
}

export function hasRows(query: QueryLike): boolean {
  return !query.isPending && !query.isError && Array.isArray(query.data) && query.data.length > 0;
}

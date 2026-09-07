/**
 * Which column belongs to which bureau — decided by the header, never by
 * position.
 *
 * ── THE RULE THAT DECIDES THIS WHOLE MODULE ────────────────────────────────
 *
 * COLUMN ORDER IS NOT BUREAU ORDER.
 *
 * A tri-merge row prints "$500  $500  $520". Somewhere above it, usually, a
 * header names the bureaus. Where that header names exactly as many bureaus as
 * there are columns, in an order the source itself states, the attribution is
 * evidence. Where it does not, attributing by position is inferring identity
 * from layout — the same mistake as inferring ownership from a display name
 * (project rule 4) — and it would manufacture the sentence "Equifax says $520"
 * out of nothing.
 *
 * ── SO THERE ARE TWO ANSWERS, AND BOTH KEEP THE DATA ───────────────────────
 *
 *   proven      → attributed:   bureau → { field → value }
 *   not proven  → unattributed: field  → [raw values, in source order]
 *
 * The second half is what makes this honest. An earlier design reduced an
 * unresolvable row to the remark "Bureau columns differ", which threw away the
 * figures along with the attribution. Now the values survive with nobody's
 * name attached:
 *
 *   PRESERVE WHAT THE SOURCE SAID WITHOUT INVENTING WHO SAID IT.
 *
 * Attribution is decided PER FIELD, not per block. A row printing one value
 * where all three bureaus agree is not evidence that all three said it — it
 * may be the only bureau reporting the account. So a single-column field is
 * never attributed, and never counted as a disagreement either.
 */
import type { Bureau } from "@/lib/credit-classification";

/** A parsed field's raw columns, as `firstColumn` returned them. */
export interface FieldColumns {
  value: string;
  differs: boolean;
  columns: string[];
}

export interface ColumnAttribution {
  /** Only fields whose column count matched the header, keyed by bureau. */
  attributed: Map<Bureau, Record<string, string>>;
  /** Multi-column fields the header could not resolve, in source order. */
  unattributed: Record<string, string[]>;
  /** The bureaus the header named, in the order it named them. */
  headerBureaus: Bureau[];
  /** Why attribution failed, where it did. Shown to a reviewer, not guessed at. */
  reason: "attributed" | "no_header" | "one_bureau_named" | "duplicate_bureau" | "nothing_multi_column";
}

const empty = (
  headerBureaus: Bureau[],
  reason: ColumnAttribution["reason"],
  unattributed: Record<string, string[]> = {},
): ColumnAttribution => ({ attributed: new Map(), unattributed, headerBureaus, reason });

/** Fields printing more than one column, which are the only ones in question. */
function multiColumn(fields: Record<string, FieldColumns | undefined>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [field, got] of Object.entries(fields)) {
    if (got && got.columns.length > 1) out[field] = got.columns;
  }
  return out;
}

/**
 * Attribute a block's columns to bureaus, or preserve them unattributed.
 *
 * `headerBureaus` must come from the source's own header text, in its order —
 * see `bureausInOrder`. Passing a document-level bureau list here would defeat
 * the entire purpose, because that list has no order the source vouched for.
 */
export function attributeColumns(
  fields: Record<string, FieldColumns | undefined>,
  headerBureaus: Bureau[],
): ColumnAttribution {
  const multi = multiColumn(fields);

  /* Nothing prints more than one column, so there is nothing to attribute and
     nothing ambiguous either. Not a failure. */
  if (Object.keys(multi).length === 0) return empty(headerBureaus, "nothing_multi_column");

  if (headerBureaus.length === 0) return empty(headerBureaus, "no_header", multi);
  if (headerBureaus.length < 2) return empty(headerBureaus, "one_bureau_named", multi);
  if (new Set(headerBureaus).size !== headerBureaus.length) {
    return empty(headerBureaus, "duplicate_bureau", multi);
  }

  const attributed = new Map<Bureau, Record<string, string>>();
  const unattributed: Record<string, string[]> = {};

  for (const [field, columns] of Object.entries(multi)) {
    /* The count is the proof. A field printing four columns under a
       three-bureau header is telling us the layout is not what we think. */
    if (columns.length !== headerBureaus.length) {
      unattributed[field] = columns;
      continue;
    }
    headerBureaus.forEach((bureau, index) => {
      const existing = attributed.get(bureau) ?? {};
      existing[field] = columns[index];
      attributed.set(bureau, existing);
    });
  }

  return {
    attributed,
    unattributed,
    headerBureaus,
    reason: attributed.size > 0 ? "attributed" : "no_header",
  };
}

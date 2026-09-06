/**
 * How many letters, and what goes in each.
 *
 * The same set of disputed items can be sent as one fat letter per bureau or
 * thirty thin ones, and the choice matters more than it looks. A bureau's
 * intake weighs volume: a single letter listing thirty-one items reads as a
 * mailing-service submission, and mailing-service submissions get the stall
 * treatment. Splitting the same items across several dated letters reads as a
 * person working through their report.
 *
 * There is a cost on the other side — more envelopes, more postage, more
 * tracking, and thirty separate 30-day clocks to watch. So this is a strategy
 * the organization picks per round, not a rule.
 *
 * Pure grouping. No wording, no legal content, no decisions about what is
 * wrong — those live in the detector, the reason library and the composer.
 */
import type { Bureau } from "@/lib/credit-classification";

export type BatchStrategy =
  /** Everything for one bureau in one letter. Fewest envelopes, heaviest look. */
  | "single_per_bureau"
  /** One letter per item. Most envelopes, hardest to dismiss as bulk. */
  | "one_per_item"
  /** A capped number of items per letter, split across several. */
  | "capped_batches"
  /** A letter per dispute type, so each recipient reads one kind of argument. */
  | "per_dispute_type"
  /** Inquiries alone. */
  | "inquiries_only"
  /** Personal information alone. */
  | "personal_only"
  /** Accounts alone. */
  | "accounts_only"
  /** Collections alone. */
  | "collections_only";

export interface BatchableItem {
  id: string;
  /** Which bureaus report it. An item only goes in that bureau's letter. */
  bureaus: Bureau[];
  /** "Account" | "Inquiry" | "Personal" | "Collection" | "Public Record" */
  itemType: string;
  /** The dispute type, for per-dispute-type batching. */
  disputeType: string;
}

export interface BatchOptions {
  strategy: BatchStrategy;
  /** For capped_batches. The default mirrors what the tools settle on. */
  maxAccountsPerLetter?: number;
  maxInquiriesPerLetter?: number;
}

export interface LetterBatch {
  bureau: Bureau;
  items: BatchableItem[];
  /** What this letter is for, shown on the queue and used in the RE: line. */
  label: string;
}

const DEFAULT_ACCOUNT_CAP = 5;
const DEFAULT_INQUIRY_CAP = 5;

const isInquiry = (i: BatchableItem) => i.itemType.toLowerCase() === "inquiry";
const isPersonal = (i: BatchableItem) => i.itemType.toLowerCase() === "personal";
const isCollection = (i: BatchableItem) => i.itemType.toLowerCase().includes("collection");
const isAccount = (i: BatchableItem) => !isInquiry(i) && !isPersonal(i);

function chunk<T>(list: T[], size: number): T[][] {
  if (size <= 0) return list.length > 0 ? [list] : [];
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * An item goes only in the letter for a bureau that actually reports it.
 *
 * This is the rule the specification states outright and the one most often
 * broken: copying every account into all three letters. A bureau asked to
 * investigate something it does not report answers that it has no such record,
 * which costs the round and makes the rest of the letter look careless.
 */
function byBureau(items: BatchableItem[], bureaus: Bureau[]): Map<Bureau, BatchableItem[]> {
  const map = new Map<Bureau, BatchableItem[]>();
  for (const b of bureaus) map.set(b, items.filter((i) => i.bureaus.includes(b)));
  return map;
}

export function buildBatches(
  items: BatchableItem[],
  bureaus: Bureau[],
  options: BatchOptions,
): LetterBatch[] {
  const perBureau = byBureau(items, bureaus);
  const out: LetterBatch[] = [];

  for (const [bureau, all] of perBureau) {
    if (all.length === 0) continue;

    switch (options.strategy) {
      case "single_per_bureau":
        out.push({ bureau, items: all, label: `All items (${all.length})` });
        break;

      case "one_per_item":
        for (const item of all) out.push({ bureau, items: [item], label: item.disputeType });
        break;

      case "capped_batches": {
        const accountCap = options.maxAccountsPerLetter ?? DEFAULT_ACCOUNT_CAP;
        const inquiryCap = options.maxInquiriesPerLetter ?? DEFAULT_INQUIRY_CAP;
        const accounts = chunk(all.filter(isAccount), accountCap);
        const inquiries = chunk(all.filter(isInquiry), inquiryCap);
        const personals = all.filter(isPersonal);
        /* Pair one account batch with one inquiry batch per letter, so a letter
           is never nothing but inquiries when accounts are still waiting. */
        const rounds = Math.max(accounts.length, inquiries.length, personals.length > 0 ? 1 : 0);
        for (let n = 0; n < rounds; n++) {
          const group = [
            ...(accounts[n] ?? []),
            ...(inquiries[n] ?? []),
            ...(n === 0 ? personals : []),
          ];
          if (group.length > 0) {
            out.push({ bureau, items: group, label: `Batch ${n + 1} of ${rounds} (${group.length} items)` });
          }
        }
        break;
      }

      case "per_dispute_type": {
        const types = [...new Set(all.map((i) => i.disputeType))].sort();
        for (const type of types) {
          const group = all.filter((i) => i.disputeType === type);
          out.push({ bureau, items: group, label: type });
        }
        break;
      }

      case "inquiries_only": {
        const group = all.filter(isInquiry);
        if (group.length > 0) out.push({ bureau, items: group, label: `Inquiries (${group.length})` });
        break;
      }
      case "personal_only": {
        const group = all.filter(isPersonal);
        if (group.length > 0) out.push({ bureau, items: group, label: `Personal information (${group.length})` });
        break;
      }
      case "accounts_only": {
        const group = all.filter((i) => isAccount(i) && !isCollection(i));
        if (group.length > 0) out.push({ bureau, items: group, label: `Accounts (${group.length})` });
        break;
      }
      case "collections_only": {
        const group = all.filter(isCollection);
        if (group.length > 0) out.push({ bureau, items: group, label: `Collections (${group.length})` });
        break;
      }
    }
  }
  return out;
}

export interface StrategyMeta {
  strategy: BatchStrategy;
  name: string;
  /** What it does, in one line, for the person choosing. */
  detail: string;
  /** The trade-off, stated. Every one of these has a cost. */
  tradeOff: string;
}

/**
 * Plain names, on purpose. The tools in this market use military ones —
 * "Shock & Awe", "Tactical Strike", "Precision Attack" — and they are fun
 * internally, but they describe the sender, not the letter. A person choosing
 * at 7am needs to know how many envelopes they are about to produce.
 */
export const BATCH_STRATEGIES: StrategyMeta[] = [
  { strategy: "single_per_bureau", name: "One letter per bureau",
    detail: "Every item for a bureau in a single letter.",
    tradeOff: "Fewest envelopes, and the heaviest to a bureau's intake. A long list reads as a bulk submission." },
  { strategy: "capped_batches", name: "Split into batches",
    detail: "A set number of accounts and inquiries per letter, spread across several.",
    tradeOff: "Reads like a person working through their report. More postage and more clocks to watch." },
  { strategy: "one_per_item", name: "One letter per item",
    detail: "Each disputed item gets its own letter.",
    tradeOff: "Hardest to treat as bulk, and the most work: one envelope and one 30-day clock per item." },
  { strategy: "per_dispute_type", name: "One letter per dispute type",
    detail: "Items grouped by what is wrong with them, so each letter makes one argument.",
    tradeOff: "The clearest to read and answer. The count depends on how varied the report is." },
  { strategy: "accounts_only", name: "Accounts only", detail: "Tradelines, excluding collections.", tradeOff: "Leaves the rest for another round." },
  { strategy: "collections_only", name: "Collections only", detail: "Collection items only.", tradeOff: "Keeps collection law out of a tradeline letter, which is usually right." },
  { strategy: "inquiries_only", name: "Inquiries only", detail: "Hard inquiries only.", tradeOff: "Short and focused; nothing else moves this round." },
  { strategy: "personal_only", name: "Personal information only", detail: "Names, addresses, employers, dates of birth.", tradeOff: "Often worth sending first, since identifiers drive mismatches." },
];

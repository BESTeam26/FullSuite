/**
 * Organization Home cards — the catalogue, the defaults, and how a saved
 * layout resolves against what the organization is entitled to.
 *
 * A card is a key. Which cards exist, which module each belongs to and the
 * default order live here and nowhere else; the Home renders whatever this
 * module resolves. Personalization is `user_preferences.dashboard_cards`
 * (an ordered array of keys, null = default). Unknown keys are dropped, cards
 * of modules the organization is not entitled to are dropped, so a saved
 * layout can never show a figure the person could not otherwise open.
 */
import type { ProductKey } from "@/lib/bes-domain";

export type HomeCardKey =
  | "work.open"
  | "work.mine"
  | "work.overdue"
  | "workspaces.count"
  | "creditops.active"
  | "creditops.processing"
  | "creditops.awaiting"
  | "creditops.attention"
  | "fundingops.active"
  | "fundingops.funded"
  | "fundingops.overdue";

export interface HomeCardDef {
  key: HomeCardKey;
  label: string;
  /** Module the figure belongs to; null = always available. */
  product: ProductKey | null;
  /** Where the card links. */
  href: string;
}

export const HOME_CARDS: readonly HomeCardDef[] = [
  { key: "work.open", label: "Open work items", product: null, href: "/app/my-work" },
  { key: "work.mine", label: "Assigned to you", product: null, href: "/app/my-work" },
  { key: "work.overdue", label: "Overdue", product: null, href: "/app/my-work" },
  { key: "workspaces.count", label: "Workspaces", product: "workspaces", href: "/app/workspaces" },
  { key: "creditops.active", label: "Active credit clients", product: "creditOps", href: "/app/operations" },
  { key: "creditops.processing", label: "In processing", product: "creditOps", href: "/app/operations" },
  { key: "creditops.awaiting", label: "Awaiting bureau response", product: "creditOps", href: "/app/operations" },
  { key: "creditops.attention", label: "Needs attention", product: "creditOps", href: "/app/operations" },
  { key: "fundingops.active", label: "Active funding clients", product: "fundingOps", href: "/app/funding-workspace" },
  { key: "fundingops.funded", label: "Funded", product: "fundingOps", href: "/app/funding-workspace" },
  { key: "fundingops.overdue", label: "Funding files overdue", product: "fundingOps", href: "/app/funding-workspace" },
];

const CARD_BY_KEY = new Map(HOME_CARDS.map((c) => [c.key, c]));

export const isHomeCardKey = (k: unknown): k is HomeCardKey =>
  typeof k === "string" && CARD_BY_KEY.has(k as HomeCardKey);

/** Cards the organization's entitlements allow, in catalogue order. */
export function availableHomeCards(enabledProducts: readonly ProductKey[]): HomeCardDef[] {
  const on = new Set(enabledProducts);
  return HOME_CARDS.filter((c) => c.product === null || on.has(c.product));
}

/**
 * The cards to show: the saved order filtered to available cards, or the
 * default (every available card) when nothing is saved or nothing survives.
 */
export function resolveHomeCards(
  saved: unknown,
  enabledProducts: readonly ProductKey[],
): HomeCardDef[] {
  const available = availableHomeCards(enabledProducts);
  if (!Array.isArray(saved)) return available;
  const allowed = new Set(available.map((c) => c.key));
  const seen = new Set<HomeCardKey>();
  const picked: HomeCardDef[] = [];
  for (const k of saved) {
    if (isHomeCardKey(k) && allowed.has(k) && !seen.has(k)) {
      seen.add(k);
      picked.push(CARD_BY_KEY.get(k)!);
    }
  }
  return picked.length > 0 ? picked : available;
}

/** Layout edits — pure, so the screen only ever sends the next full list. */
export function toggleHomeCard(current: readonly HomeCardKey[], key: HomeCardKey): HomeCardKey[] {
  return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
}

export function moveHomeCard(current: readonly HomeCardKey[], key: HomeCardKey, delta: -1 | 1): HomeCardKey[] {
  const i = current.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= current.length) return [...current];
  const next = [...current];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

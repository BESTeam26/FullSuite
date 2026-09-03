/**
 * Sample records for the CreditOps SaaS client list (`/app/clients`).
 *
 * NOT the canonical client record. These are placeholder rows for a surface
 * that has no backend yet: the SaaS client workspace arrives in Phase 6 on
 * `credit_cases` and `report_snapshots`, keyed to the same person as the
 * CreditOps fulfillment record rather than to a separate list.
 *
 * Until then this MUST stay labelled in the interface (rule 12) and MUST NOT
 * be extended — the fix for "one person, three shapes" is to reconcile these
 * onto the canonical record, not to add more rows here (rule 2).
 *
 * Lives outside the page so a component never carries its own dataset
 * (rule 5), and so the swap to real data is a one-line import change.
 */

export type Client = {
  id: string;
  name: string;
  email: string;
  score: number;
  change: number;
  trend: number[];
  status: "Active" | "Onboarding" | "Dispute" | "Paused";
  round: string;
  roundProgress: number;
  disputes: number;
  deletions: number;
  lastActivity: string;
  nextAction: string;
  nextActionTone: "ready" | "attention" | "waiting";
  leadSource: "BES DIY Credit" | "Direct" | "Partner Referral" | "Inbound";
};

export const sampleClients: Client[] = [
  {
    id: "1",
    name: "Maria Gonzalez",
    email: "maria.g@email.com",
    score: 712,
    change: 58,
    trend: [640, 651, 662, 671, 684, 698, 712],
    status: "Active",
    round: "Round 3",
    roundProgress: 80,
    disputes: 14,
    deletions: 9,
    lastActivity: "2h ago",
    nextAction: "Ready to bill",
    nextActionTone: "ready",
    leadSource: "BES DIY Credit",
  },
  {
    id: "2",
    name: "James Whitaker",
    email: "jwhitaker@email.com",
    score: 648,
    change: 31,
    trend: [605, 611, 619, 624, 630, 639, 648],
    status: "Active",
    round: "Round 2",
    roundProgress: 55,
    disputes: 8,
    deletions: 4,
    lastActivity: "1d ago",
    nextAction: "Awaiting CRA response",
    nextActionTone: "waiting",
    leadSource: "BES DIY Credit",
  },
  {
    id: "3",
    name: "Tanya Brooks",
    email: "tanya.b@email.com",
    score: 689,
    change: 44,
    trend: [630, 640, 651, 660, 668, 678, 689],
    status: "Onboarding",
    round: "Intake",
    roundProgress: 20,
    disputes: 3,
    deletions: 0,
    lastActivity: "4h ago",
    nextAction: "Documents required",
    nextActionTone: "attention",
    leadSource: "Partner Referral",
  },
  {
    id: "4",
    name: "Devon Park",
    email: "devon.p@email.com",
    score: 601,
    change: 12,
    trend: [598, 596, 601, 599, 603, 600, 601],
    status: "Dispute",
    round: "Round 1",
    roundProgress: 35,
    disputes: 11,
    deletions: 6,
    lastActivity: "31d ago",
    nextAction: "Stalled — needs review",
    nextActionTone: "attention",
    leadSource: "Direct",
  },
  {
    id: "5",
    name: "Lena Ortiz",
    email: "lena.o@email.com",
    score: 734,
    change: 67,
    trend: [672, 685, 696, 704, 715, 726, 734],
    status: "Active",
    round: "Round 4",
    roundProgress: 95,
    disputes: 17,
    deletions: 13,
    lastActivity: "3h ago",
    nextAction: "Ready to bill",
    nextActionTone: "ready",
    leadSource: "Inbound",
  },
  {
    id: "6",
    name: "Marcus Lee",
    email: "marcus.l@email.com",
    score: 622,
    change: 24,
    trend: [600, 604, 609, 612, 615, 619, 622],
    status: "Paused",
    round: "Round 1",
    roundProgress: 10,
    disputes: 6,
    deletions: 2,
    lastActivity: "12d ago",
    nextAction: "Subscription paused",
    nextActionTone: "waiting",
    leadSource: "Direct",
  },
];

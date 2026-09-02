// AI Copilot Q&A knowledge base — keyword-matched educational answers on
// FCRA factual disputing, Metro 2, and consumer-protection law.

export interface QAEntry {
  id: string;
  keywords: string[];
  question: string;
  answer: string;
  citations?: string[];
}

export const qaEntries: QAEntry[] = [
  {
    id: "what-is-dofd",
    keywords: ["dofd", "date of first delinquency", "re-age", "reage"],
    question: "What is DOFD and why does it matter?",
    answer:
      "Date of First Delinquency (DOFD) is the date an account first became delinquent and was never subsequently brought current. It anchors the FCRA § 605 seven-year removal clock. A furnisher cannot lawfully reset DOFD by re-reporting the same debt later — if a later snapshot shows a newer DOFD with no new delinquency, that's a strong factual review candidate, not an automatic violation. Always confirm against original account statements before treating it as inaccurate.",
    citations: ["FCRA § 605(c)", "FCRA § 623(a)(5)"],
  },
  {
    id: "what-is-metro2",
    keywords: ["metro 2", "metro2", "furnisher format", "e-oscar"],
    question: "What is Metro 2, and can we generate Metro 2 files ourselves?",
    answer:
      "Metro 2 is the standardized electronic format data furnishers use to report account information to the CRAs — it is not a consumer dispute-letter format. CDIA restricts access to the full specification to furnishers, processors, qualifying software vendors, and CRAs. BES's Data Integrity Engine analyzes Metro 2 concepts (DOFD, Compliance Condition Codes, Payment History Profile) to flag factual discrepancies, but true Metro 2 file generation and e-OSCAR (ACDV/AUD) connectivity are reserved for the gated Furnisher Suite, available only to eligible furnisher accounts.",
    citations: ["CDIA Metro 2 Format Guide", "e-OSCAR Service overview"],
  },
  {
    id: "factual-dispute-basics",
    keywords: [
      "factual dispute",
      "how to dispute",
      "dispute basis",
      "what is wrong",
    ],
    question: "What makes a dispute 'factual' instead of a template dispute?",
    answer:
      "A factual dispute identifies the specific field that is wrong (e.g., balance, status, DOFD), states what the correct value should be, explains why, and attaches supporting evidence — then the consumer attests the explanation is true. Regulation V and FCRA §611/§623 both expect the same structure: identify the item, state the basis, and provide reasonably required documentation. Selecting a generic reason code from a dropdown without evidence is a template dispute and is more likely to be treated as frivolous.",
    citations: ["FCRA § 611(a)(3)", "Reg V, 12 C.F.R. § 1022.43"],
  },
  {
    id: "cro-direct-dispute-exception",
    keywords: [
      "direct dispute",
      "furnisher exception",
      "cro form",
      "credit repair organization",
    ],
    question:
      "Why can't we just blast direct-furnisher disputes for every client?",
    answer:
      "Regulation V lets a furnisher decline to apply direct-dispute handling duties where it reasonably believes the dispute was submitted by, prepared on behalf of the consumer by, or supplied on a form by a credit repair organization. Mass-generated, agency-authored direct disputes risk being disregarded entirely. The safer design is a consumer-originated workflow: the consumer reviews the facts, answers structured questions in their own words, and approves the final language themselves.",
    citations: ["Reg V, 12 C.F.R. § 1022.43(f)", "FCRA § 623(a)(8)"],
  },
  {
    id: "verified-response-next-step",
    keywords: [
      "verified",
      "came back verified",
      "mov",
      "method of verification",
    ],
    question:
      "The bureau said an item was 'verified.' What's the next lawful step?",
    answer:
      "A bare 'verified' response with no description of what was reviewed can support a Method of Verification (MOV) request under FCRA § 609 — asking the CRA/furnisher to describe the specific records and process used. This is not itself proof of a violation; it is a documentation step. If the furnisher cannot produce any investigation record after a proper MOV request, that pattern becomes relevant evidence for counsel to evaluate under §§ 611/623(b)/616-617.",
    citations: ["FCRA § 609", "FCRA § 611(a)(7)"],
  },
  {
    id: "fdcpa-vs-fcra",
    keywords: ["fdcpa", "difference", "collector", "debt collector law"],
    question: "What's the difference between FCRA and FDCPA issues?",
    answer:
      "FCRA governs the accuracy of what's reported to and by consumer reporting agencies (bureaus and furnishers). FDCPA governs how third-party debt collectors communicate and collect — false statements, harassment, missing validation, or collecting time-barred debt. The same account can raise both: a collector might report an inaccurate balance (FCRA issue) while also misrepresenting the debt on a collection call (FDCPA issue). Flag each separately with its own evidence.",
    citations: ["FCRA §§ 611, 623", "FDCPA §§ 807–809"],
  },
  {
    id: "identity-theft-workflow",
    keywords: ["identity theft", "fraud", "not my account", "stolen identity"],
    question: "A client says an account isn't theirs. What should happen?",
    answer:
      "Route this to the dedicated identity-theft workflow rather than a standard factual dispute. Do not let AI infer or fabricate identity-theft facts. The consumer should complete an identity verification step, and where appropriate, a police report or FTC identity theft report should be collected as evidence before any dispute language references fraud.",
    citations: ["FCRA § 605B (block for identity theft victims)"],
  },
  {
    id: "obsolescence-check",
    keywords: [
      "7 years",
      "seven years",
      "how long negative",
      "obsolete",
      "bankruptcy 10 years",
    ],
    question: "How long can a negative item legally stay on a report?",
    answer:
      "Most adverse items must be removed 7 years after DOFD. Most Chapter 7 bankruptcies may be reported for up to 10 years from the filing date. If the correct DOFD is confirmed and 7 years (or 10 for qualifying bankruptcy) have elapsed, continued reporting is a strong factual issue to raise — always confirm the DOFD first, since an incorrect DOFD is often the real root cause.",
    citations: ["FCRA § 605(a)"],
  },
  {
    id: "billing-eligibility",
    keywords: ["charge fee", "bill client", "advance fee", "telemarketing fee"],
    question: "When are we actually allowed to bill a client?",
    answer:
      "CROA bars collecting a fee for covered credit-repair services before those services are fully performed. If the client was acquired through telemarketing, the TSR requires the fee to wait until documented results have been achieved and held for more than six months. BES's Billing Eligibility Engine gates invoicing on the applicable rule automatically — see the Compliance & Billing page for the live eligibility check on any client.",
    citations: ["CROA § 404(b)", "TSR 16 C.F.R. § 310.4(a)(2)"],
  },
  {
    id: "reinsertion-rules",
    keywords: ["reinsert", "reinsertion", "came back", "item returned"],
    question: "A deleted item reappeared on a later report. Is that legal?",
    answer:
      "A CRA may reinsert previously deleted information only if the furnisher certifies it is accurate and complete, and the CRA must notify the consumer in writing within 5 business days, including the furnisher's contact information. Reinsertion without that certification and notice is a documented factual/process issue worth flagging in the Case Timeline.",
    citations: ["FCRA § 611(a)(5)"],
  },
  {
    id: "payment-history-mismatch",
    keywords: ["payment history", "late payment wrong", "php mismatch"],
    question: "One bureau shows a late payment the others don't. What now?",
    answer:
      "This is a classic Payment History Profile (PHP) discrepancy. Compare the specific month across all three bureaus, then ask the consumer for a bank statement or payment confirmation for that month. If the consumer's evidence supports on-time payment, this becomes a factual dispute citing the specific month and furnished rating — not a generalized 'remove all late payments' request.",
    citations: ["FCRA § 623(a)(1)"],
  },
  {
    id: "joint-vs-individual",
    keywords: ["joint account", "authorized user", "ecoa", "responsibility"],
    question:
      "A client says an account should be authorized-user, not individual liability. What's the issue?",
    answer:
      "This points to the ECOA/Account Designator field in Metro 2 — it identifies the consumer's actual relationship to the account (individual, joint, authorized user, terminated). If bureaus disagree, or the designator conflicts with the original account agreement, gather the agreement or card issuance record as evidence before disputing the designation.",
    citations: ["FCRA § 623(a)(1)", "Metro 2 ECOA / Account Designator field"],
  },
];

export function matchQAEntry(query: string): QAEntry | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let best: { entry: QAEntry; score: number } | null = null;
  for (const entry of qaEntries) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += kw.length;
    }
    if (entry.question.toLowerCase().includes(q)) score += 5;
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}

// FCRA statutory reference summaries — educational content, not legal advice.

export interface FCRASection {
  code: string;
  title: string;
  citation: string;
  summary: string;
  keyPoints: string[];
}

export const fcraSections: FCRASection[] = [
  {
    code: "§605",
    title: "Obsolescence periods for adverse information",
    citation: "FCRA § 605, 15 U.S.C. § 1681c",
    summary:
      "Most adverse items must be removed after 7 years from the date of first delinquency (DOFD); most Chapter 7 bankruptcies after 10 years.",
    keyPoints: [
      "7-year clock runs from DOFD, not from the last activity or charge-off date",
      "Chapter 7 bankruptcy: 10 years from filing date",
      "Chapter 13 bankruptcy: commonly reported 7 years from filing",
      "A reported DOFD that resets after re-aging is a common factual issue to investigate",
    ],
  },
  {
    code: "§609",
    title: "Consumer's right to disclosure",
    citation: "FCRA § 609, 15 U.S.C. § 1681g",
    summary:
      "Consumers may request the information a CRA has in their file, sources of that information, and who has received reports.",
    keyPoints: [
      "Basis for requesting method of verification (MOV) after a dispute result",
      "CRAs must disclose the sources of information upon request",
      "Does not create a separate 'special' request format — this is a disclosure right, not a dispute channel",
    ],
  },
  {
    code: "§611",
    title: "Procedure in case of disputed accuracy (reinvestigation)",
    citation: "FCRA § 611, 15 U.S.C. § 1681i",
    summary:
      "CRAs must conduct a reasonable reinvestigation of disputed items, generally within 30 days (up to 45 with consumer-provided information), and delete or modify information that cannot be verified.",
    keyPoints: [
      "The dispute must identify the specific item and explain the basis",
      "CRA must forward all relevant information to the furnisher",
      "CRA generally must give results within 5 business days of completing reinvestigation",
      "Frivolous or irrelevant disputes may be declined — specificity and evidence matter",
      "Previously deleted items reinserted must be certified as accurate and consumer notified",
    ],
  },
  {
    code: "§615",
    title: "Requirements on users of consumer reports",
    citation: "FCRA § 615, 15 U.S.C. § 1681m",
    summary:
      "Users taking adverse action based on a report must provide notice, the CRA's identity, and dispute rights.",
    keyPoints: [
      "Adverse action notices are a common trigger for a consumer to request a report",
      "Failure to provide a required notice can itself be a compliance issue for the user, not the CRA",
    ],
  },
  {
    code: "§616 / §617",
    title: "Civil liability for willful / negligent noncompliance",
    citation: "FCRA §§ 616–617, 15 U.S.C. §§ 1681n–1681o",
    summary:
      "Establishes actual damages for negligent noncompliance, and actual/statutory/punitive damages plus attorney fees for willful noncompliance.",
    keyPoints: [
      "Willfulness generally requires knowing or reckless disregard of FCRA duties",
      "A single reporting discrepancy is not automatically 'willful' — pattern, notice, and failure to correct matter",
      "This is the legal basis behind demand letters after unresolved factual disputes — should be reviewed by counsel before assertion",
    ],
  },
  {
    code: "§623(a)",
    title: "Furnisher duty of accuracy & direct disputes",
    citation: "FCRA § 623(a), 15 U.S.C. § 1681s-2(a)",
    summary:
      "Furnishers must not report information they know or reasonably believe is inaccurate, must correct and update information, and must investigate direct disputes from consumers.",
    keyPoints: [
      "Direct disputes must identify the specific information and the basis, with supporting documentation",
      "A furnisher may decline to process a direct dispute it reasonably believes was submitted by, or prepared on behalf of the consumer by, a credit repair organization, or on a CRO-supplied form",
      "This exception is why consumer-originated language and independent attestation matter for direct-to-furnisher workflows",
    ],
  },
  {
    code: "§623(b)",
    title: "Furnisher duties upon CRA-forwarded disputes",
    citation: "FCRA § 623(b), 15 U.S.C. § 1681s-2(b)",
    summary:
      "Once a CRA notifies a furnisher of a dispute, the furnisher must investigate, review all relevant information, and report results back to the CRA — including corrections or deletions.",
    keyPoints: [
      "Furnisher must report the outcome to all CRAs it originally furnished the information to",
      "Failure to conduct a reasonable investigation here is a frequent basis for furnisher liability claims",
      "'Verified' responses without documented investigation steps are a common point for a reinvestigation procedure request",
    ],
  },
  {
    code: "Reg V",
    title: "Direct dispute procedures (furnisher rule)",
    citation: "12 C.F.R. Part 1022, Subpart E",
    summary:
      "CFPB rule implementing furnisher accuracy and direct-dispute-handling duties, including required dispute content and furnisher response duties.",
    keyPoints: [
      "A qualifying direct dispute must reasonably identify the account and describe the basis",
      "Furnishers may treat a dispute as not qualifying if it lacks sufficient identifying information",
      "Furnishers may exclude disputes reasonably believed to be CRO-submitted from the direct-dispute regime — design consumer-originated flows accordingly",
    ],
  },
];

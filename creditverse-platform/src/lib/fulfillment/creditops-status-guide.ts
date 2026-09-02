/**
 * Status Guide Definitions for CreditOps Agency Fulfillment
 * Exactly matching internal SOPs and processing status standards.
 */

export interface StatusGuideItem {
  code: string;
  name: string;
  description: string;
  category: "dispute" | "support" | "bureau" | "complaints" | "onboarding";
  badgeClass: string;
}

export const CREDIT_OPS_STATUS_GUIDE: StatusGuideItem[] = [
  // Dispute / Processing Team
  {
    code: "NEW ONBOARDING",
    name: "NEW ONBOARDING",
    description:
      "New client intake started. Collect ID, proof of address, credit monitoring access, and payment confirmation before moving to processing.",
    category: "dispute",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  {
    code: "INCOMPLETE ONBOARDING",
    name: "INCOMPLETE ONBOARDING",
    description:
      "Client onboarding is incomplete — missing documents, payment, or required information. Follow up with client or partner.",
    category: "dispute",
    badgeClass: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  },
  {
    code: "READY FOR ROUND 1",
    name: "READY FOR ROUND 1",
    description:
      "Client is fully onboarded and ready for Round 1 dispute generation. Assign to a dispute processor.",
    category: "dispute",
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  },
  {
    code: "READY FOR PROCESSING",
    name: "READY FOR PROCESSING",
    description:
      "Client is paid and ready for the current round. Process disputes, generate letters, and submit to bureaus.",
    category: "dispute",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  },
  {
    code: "ROUND SENT - AWAITING RESULTS",
    name: "ROUND SENT - AWAITING RESULTS",
    description:
      "Dispute letters have been mailed. Waiting for bureau/creditor response (30-45 days). Monitor for results.",
    category: "dispute",
    badgeClass: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  },
  {
    code: "READY FOR REIMPORT / REVIEW",
    name: "READY FOR REIMPORT / REVIEW",
    description:
      "Bureau results received. Reimport client file, review deletions/investigations, and prepare next steps.",
    category: "dispute",
    badgeClass: "bg-pink-500/10 text-pink-700 border-pink-500/30",
  },
  {
    code: "WAITING FOR PARTNER APPROVAL",
    name: "WAITING FOR PARTNER APPROVAL",
    description:
      "Awaiting partner approval before proceeding. Partner must confirm next action or approve changes.",
    category: "dispute",
    badgeClass: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30",
  },
  {
    code: "COMPLETED",
    name: "COMPLETED",
    description:
      "All work complete for this cycle. File can be archived or moved to the next round.",
    category: "dispute",
    badgeClass: "bg-emerald-600/10 text-emerald-800 border-emerald-600/30",
  },
  {
    code: "ARCHIVED / INACTIVE",
    name: "ARCHIVED / INACTIVE",
    description:
      "File is archived and no longer active. Excluded from active volume counts.",
    category: "dispute",
    badgeClass: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  },

  // Customer Support Team
  {
    code: "SUPPORT NEW",
    name: "SUPPORT NEW",
    description: "New support case opened. Acknowledge within 4 hours.",
    category: "support",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  {
    code: "ONBOARDING FOLLOWUP",
    name: "ONBOARDING FOLLOWUP",
    description: "Scheduled follow-up needed during client onboarding process.",
    category: "support",
    badgeClass: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  },
  {
    code: "READY FOR REIMPORT",
    name: "READY FOR REIMPORT",
    description:
      "Bureau results received — reimport file and review for deletions/changes.",
    category: "support",
    badgeClass: "bg-pink-500/10 text-pink-700 border-pink-500/30",
  },
  {
    code: "MONITORING ISSUE",
    name: "MONITORING ISSUE",
    description: "Credit monitoring login or access issue reported by client.",
    category: "support",
    badgeClass: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  },
  {
    code: "BILLING ISSUE",
    name: "BILLING ISSUE",
    description:
      "Client billing problem — payment failed, dispute charge, or subscription issue.",
    category: "support",
    badgeClass: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  },
  {
    code: "WAITING CLIENT RESPONSE",
    name: "WAITING CLIENT RESPONSE",
    description:
      "Waiting for client to respond to our inquiry. Auto-follow-up in 48 hours if no response.",
    category: "support",
    badgeClass: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  },
  {
    code: "ESCALATED TO MANAGEMENT",
    name: "ESCALATED TO MANAGEMENT",
    description: "Issue escalated to management. Requires immediate attention.",
    category: "support",
    badgeClass: "bg-red-600/10 text-red-800 border-red-600/30 font-semibold",
  },
  {
    code: "SUPPORT RESOLVED",
    name: "SUPPORT RESOLVED",
    description:
      "Support case resolved successfully. Document outcome and close.",
    category: "support",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  },

  // Bureau Calling Team
  {
    code: "BC NOT NEEDED",
    name: "BC NOT NEEDED",
    description: "No bureau call required for this client at this time.",
    category: "bureau",
    badgeClass: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  },
  {
    code: "BC NEEDED",
    name: "BC NEEDED",
    description:
      "Client needs a bureau verification call. Assign to bureau caller within 24 hours.",
    category: "bureau",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  {
    code: "BC IN PROGRESS",
    name: "BC IN PROGRESS",
    description:
      "Bureau call is actively being handled by a bureau caller agent.",
    category: "bureau",
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  },
  {
    code: "BC COMPLETED",
    name: "BC COMPLETED",
    description:
      "Bureau call completed. Results logged. File ready for next processing step.",
    category: "bureau",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  },

  // Complaints & Mailing Team
  {
    code: "CM NOT NEEDED",
    name: "CM NOT NEEDED",
    description:
      "No complaints or mailing work needed for this client at this time.",
    category: "complaints",
    badgeClass: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  },
  {
    code: "LETTERS PENDING",
    name: "LETTERS PENDING",
    description:
      "Dispute letters need to be prepared and mailed. Priority within 48 hours.",
    category: "complaints",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  {
    code: "LETTERS MAILED",
    name: "LETTERS MAILED",
    description:
      "Letters have been mailed. Waiting for delivery confirmation and bureau response.",
    category: "complaints",
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  },
  {
    code: "CFPB FILED",
    name: "CFPB FILED",
    description:
      "CFPB complaint has been filed. Monitor for response within 15 days.",
    category: "complaints",
    badgeClass: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  },
  {
    code: "FTC FILED",
    name: "FTC FILED",
    description: "FTC complaint has been filed. Monitor for response.",
    category: "complaints",
    badgeClass: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  },
  {
    code: "BBB FILED",
    name: "BBB FILED",
    description: "BBB complaint has been filed. Monitor for business response.",
    category: "complaints",
    badgeClass: "bg-amber-600/10 text-amber-800 border-amber-600/30",
  },
  {
    code: "AG FILED",
    name: "AG FILED",
    description:
      "Attorney General complaint has been filed. Monitor for response.",
    category: "complaints",
    badgeClass: "bg-rose-600/10 text-rose-800 border-rose-600/30",
  },
  {
    code: "CM AWAITING RESPONSE",
    name: "CM AWAITING RESPONSE",
    description:
      "Complaints filed — awaiting bureau/agency response (30-45 days).",
    category: "complaints",
    badgeClass: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  },
  {
    code: "CM COMPLETED",
    name: "CM COMPLETED",
    description: "All complaints and mailing work completed for this cycle.",
    category: "complaints",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  },

  // Onboarding Team
  {
    code: "OB NOT STARTED",
    name: "OB NOT STARTED",
    description:
      "Client has not started onboarding. Begin intake and document collection.",
    category: "onboarding",
    badgeClass: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  },
  {
    code: "OB IN REVIEW",
    name: "OB IN REVIEW",
    description:
      "Onboarding in progress — reviewing client information and documents.",
    category: "onboarding",
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  },
  {
    code: "DOCS PENDING",
    name: "DOCS PENDING",
    description:
      "Client documents are missing or incomplete. Follow up with client.",
    category: "onboarding",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  {
    code: "MONITORING PENDING",
    name: "MONITORING PENDING",
    description: "Credit monitoring account needs to be set up and verified.",
    category: "onboarding",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  {
    code: "ACCESS VERIFIED",
    name: "ACCESS VERIFIED",
    description:
      "Client access verified — monitoring, portals, and credentials confirmed.",
    category: "onboarding",
    badgeClass: "bg-teal-500/10 text-teal-700 border-teal-500/30",
  },
  {
    code: "OB READY FOR R1",
    name: "OB READY FOR R1",
    description:
      "Client fully onboarded and ready for Round 1 dispute processing.",
    category: "onboarding",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  },
  {
    code: "PARTNER ENDORSED",
    name: "PARTNER ENDORSED",
    description:
      "Partner has reviewed and endorsed the client file for processing.",
    category: "onboarding",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  },
  {
    code: "OB INCOMPLETE",
    name: "OB INCOMPLETE",
    description:
      "Onboarding incomplete — missing critical documents or monitoring.",
    category: "onboarding",
    badgeClass: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  },
];

/**
 * Status Guide Definitions for CreditOps Agency Fulfillment
 * Exactly matching internal SOPs and processing status standards.
 *
 * Each entry carried its OWN `badgeClass` until 2026-09-26 — a third tone
 * table, beside the client list's and DivisionLayout's. That made the guide
 * the one place a wrong colour could not be noticed: it is what an agent opens
 * to learn what a colour MEANS, so a legend that disagrees with the list is
 * worse than no legend. The chip now reads the canonical map like every other
 * surface, and this file describes statuses rather than painting them.
 */

export interface StatusGuideItem {
  code: string;
  name: string;
  description: string;
  category: "dispute" | "support" | "bureau" | "complaints" | "onboarding";
}

export const CREDIT_OPS_STATUS_GUIDE: StatusGuideItem[] = [
  // Dispute / Processing Team
  {
    code: "NEW ONBOARDING",
    name: "NEW ONBOARDING",
    description:
      "New client intake started. Collect ID, proof of address, credit monitoring access, and payment confirmation before moving to processing.",
    category: "dispute",
  },
  {
    code: "INCOMPLETE ONBOARDING",
    name: "INCOMPLETE ONBOARDING",
    description:
      "Client onboarding is incomplete — missing documents, payment, or required information. Follow up with client or partner.",
    category: "dispute",
  },
  {
    code: "READY FOR ROUND 1",
    name: "READY FOR ROUND 1",
    description:
      "Client is fully onboarded and ready for Round 1 dispute generation. Assign to a dispute processor.",
    category: "dispute",
  },
  {
    code: "READY FOR PROCESSING",
    name: "READY FOR PROCESSING",
    description:
      "Client is paid and ready for the current round. Process disputes, generate letters, and submit to bureaus.",
    category: "dispute",
  },
  {
    code: "ROUND SENT - AWAITING RESULTS",
    name: "ROUND SENT - AWAITING RESULTS",
    description:
      "Dispute letters have been mailed. Waiting for bureau/creditor response (30-45 days). Monitor for results.",
    category: "dispute",
  },
  {
    code: "READY FOR REIMPORT / REVIEW",
    name: "READY FOR REIMPORT / REVIEW",
    description:
      "Bureau results received. Reimport client file, review deletions/investigations, and prepare next steps.",
    category: "dispute",
  },
  {
    code: "WAITING FOR PARTNER APPROVAL",
    name: "WAITING FOR PARTNER APPROVAL",
    description:
      "Awaiting partner approval before proceeding. Partner must confirm next action or approve changes.",
    category: "dispute",
  },
  {
    code: "COMPLETED",
    name: "COMPLETED",
    description:
      "All work complete for this cycle. File can be archived or moved to the next round.",
    category: "dispute",
  },
  {
    code: "ARCHIVED / INACTIVE",
    name: "ARCHIVED / INACTIVE",
    description:
      "File is archived and no longer active. Excluded from active volume counts.",
    category: "dispute",
  },

  // Customer Support Team
  {
    code: "SUPPORT NEW",
    name: "SUPPORT NEW",
    description: "New support case opened. Acknowledge within 4 hours.",
    category: "support",
  },
  {
    code: "ONBOARDING FOLLOWUP",
    name: "ONBOARDING FOLLOWUP",
    description: "Scheduled follow-up needed during client onboarding process.",
    category: "support",
  },
  {
    code: "READY FOR REIMPORT",
    name: "READY FOR REIMPORT",
    description:
      "Bureau results received — reimport file and review for deletions/changes.",
    category: "support",
  },
  {
    code: "MONITORING ISSUE",
    name: "MONITORING ISSUE",
    description: "Credit monitoring login or access issue reported by client.",
    category: "support",
  },
  {
    code: "BILLING ISSUE",
    name: "BILLING ISSUE",
    description:
      "Client billing problem — payment failed, dispute charge, or subscription issue.",
    category: "support",
  },
  {
    code: "WAITING CLIENT RESPONSE",
    name: "WAITING CLIENT RESPONSE",
    description:
      "Waiting for client to respond to our inquiry. Auto-follow-up in 48 hours if no response.",
    category: "support",
  },
  {
    code: "ESCALATED TO MANAGEMENT",
    name: "ESCALATED TO MANAGEMENT",
    description: "Issue escalated to management. Requires immediate attention.",
    category: "support",
  },
  {
    code: "SUPPORT RESOLVED",
    name: "SUPPORT RESOLVED",
    description:
      "Support case resolved successfully. Document outcome and close.",
    category: "support",
  },

  // Bureau Calling Team
  {
    code: "BUREAU CALLING NOT NEEDED",
    name: "BUREAU CALLING NOT NEEDED",
    description: "No bureau call required for this client at this time.",
    category: "bureau",
  },
  {
    code: "BUREAU CALLING NEEDED",
    name: "BUREAU CALLING NEEDED",
    description:
      "Client needs a bureau verification call. Assign to bureau caller within 24 hours.",
    category: "bureau",
  },
  {
    code: "BUREAU CALLING IN PROGRESS",
    name: "BUREAU CALLING IN PROGRESS",
    description:
      "Bureau call is actively being handled by a bureau caller agent.",
    category: "bureau",
  },
  {
    code: "BUREAU CALLING COMPLETED",
    name: "BUREAU CALLING COMPLETED",
    description:
      "Bureau call completed. Results logged. File ready for next processing step.",
    category: "bureau",
  },

  // Complaints & Mailing Team
  /* ── THE STEP BEFORE A COMPLAINT IS FILED (Dee, 2026-09-22) ─────────────
     The guide only ever had FILED states, but the team has been typing
     "For Complaints", "CFPB Needed" and "FTC Needed" — nine rows of a status
     no queue could route on. Dee: that is a missing step, not a typo, so the
     guide gains it rather than the work being reinterpreted as something it
     is not. All three are work to do now: nobody outside BES is holding them
     up, which is what separates them from COMPLAINT AWAITING RESPONSE. */
  {
    code: "FOR COMPLAINTS",
    name: "FOR COMPLAINTS",
    description:
      "Handed to Complaints & Mailing and waiting to be picked up. The entry state: somebody decides here which complaint, if any, this file needs.",
    category: "complaints",
  },
  {
    code: "CFPB NEEDED",
    name: "CFPB NEEDED",
    description:
      "A CFPB complaint has been decided on and still has to be filed. Becomes CFPB FILED once it is submitted.",
    category: "complaints",
  },
  {
    code: "FTC NEEDED",
    name: "FTC NEEDED",
    description:
      "An FTC complaint has been decided on and still has to be filed. Becomes FTC FILED once it is submitted.",
    category: "complaints",
  },
  {
    code: "COMPLAINT NOT NEEDED",
    name: "COMPLAINT NOT NEEDED",
    description:
      "No complaints or mailing work needed for this client at this time.",
    category: "complaints",
  },
  {
    code: "LETTERS PENDING",
    name: "LETTERS PENDING",
    description:
      "Dispute letters need to be prepared and mailed. Priority within 48 hours.",
    category: "complaints",
  },
  {
    code: "LETTERS MAILED",
    name: "LETTERS MAILED",
    description:
      "Letters have been mailed. Waiting for delivery confirmation and bureau response.",
    category: "complaints",
  },
  {
    code: "CFPB FILED",
    name: "CFPB FILED",
    description:
      "CFPB complaint has been filed. Monitor for response within 15 days.",
    category: "complaints",
  },
  {
    code: "FTC FILED",
    name: "FTC FILED",
    description: "FTC complaint has been filed. Monitor for response.",
    category: "complaints",
  },
  {
    code: "BBB FILED",
    name: "BBB FILED",
    description: "BBB complaint has been filed. Monitor for business response.",
    category: "complaints",
  },
  {
    code: "AG FILED",
    name: "AG FILED",
    description:
      "Attorney General complaint has been filed. Monitor for response.",
    category: "complaints",
  },
  {
    code: "COMPLAINT AWAITING RESPONSE",
    name: "COMPLAINT AWAITING RESPONSE",
    description:
      "Complaints filed — awaiting bureau/agency response (30-45 days).",
    category: "complaints",
  },
  {
    code: "COMPLAINT COMPLETED",
    name: "COMPLAINT COMPLETED",
    description: "All complaints and mailing work completed for this cycle.",
    category: "complaints",
  },

  // Onboarding Team
  {
    code: "INCOMPLETE ONBOARDING",
    name: "INCOMPLETE ONBOARDING",
    description:
      "Something is still missing — documents, payment or monitoring access. This is the state a file arrives in and what a handoff to Onboarding opens on; BES has no separate \"not started\" (Dee, 2026-09-22).",
    category: "onboarding",
  },
  {
    code: "ONBOARDING IN REVIEW",
    name: "ONBOARDING IN REVIEW",
    description:
      "Onboarding in progress — reviewing client information and documents.",
    category: "onboarding",
  },
  {
    code: "DOCS PENDING",
    name: "DOCS PENDING",
    description:
      "Client documents are missing or incomplete. Follow up with client.",
    category: "onboarding",
  },
  {
    code: "ACCESS VERIFIED",
    name: "ACCESS VERIFIED",
    description:
      "Client access verified — monitoring, portals, and credentials confirmed.",
    category: "onboarding",
  },
  {
    code: "ONBOARDING READY FOR ROUND 1",
    name: "ONBOARDING READY FOR ROUND 1",
    description:
      "Client fully onboarded and ready for Round 1 dispute processing.",
    category: "onboarding",
  },
  {
    code: "PARTNER ENDORSED",
    name: "PARTNER ENDORSED",
    description:
      "Partner has reviewed and endorsed the client file for processing.",
    category: "onboarding",
  },
];

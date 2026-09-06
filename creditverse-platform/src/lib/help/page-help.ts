/**
 * "How this page works" — short, user-facing help for every main screen,
 * chosen by route. Pure data plus one lookup so the content is reviewable in
 * one place and testable. Wording is for the people using the platform:
 * no internal terms, no vendor jargon.
 */

export interface PageHelp {
  title: string;
  summary: string;
  steps: string[];
  tip?: string;
}

/** Longest matching prefix wins, so a client profile beats the client list. */
const HELP: [prefix: string, help: PageHelp][] = [
  ["/app/org/", {
    title: "Home",
    summary: "Your organization at a glance: the figures your role may see, open work, and your modules.",
    steps: ["Use the tiles to jump to the area behind each figure.", "Administrators can choose which tiles show with Customize Home.", "The Getting started guide disappears once every step is done."],
  }],
  ["/app/my-work", {
    title: "My Work",
    summary: "Everything assigned to you, across every module, in one list.",
    steps: ["Open an item to work it; its stage, due date and comments are on the item.", "Overdue items rise to the top.", "Time you track on an item counts toward your production."],
  }],
  ["/app/workspaces", {
    title: "Workspaces",
    summary: "Boards and lists for work that is not credit repair or funding — your own operations.",
    steps: ["Create a workspace, then its statuses, fields and views: they are yours to define.", "Every item shares the same engine as the rest of the platform, so time, End of Day and reports include it."],
  }],
  ["/app/dispute-dashboard", {
    title: "CreditOps Dashboard",
    summary: "Where every client stands in the dispute cycle, and what needs attention today.",
    steps: ["Each queue lists clients by what is next: letters to build, approvals waiting, responses due.", "Open a queue to work the clients in it.", "Figures come only from your clients' records."],
  }],
  ["/app/clients/", {
    title: "Client profile",
    summary: "One client's whole file: report, analysis, disputes, letters, progress.",
    steps: ["Import & Analysis: bring in the credit report (PDF or CSV) and review every item before it is saved.", "Letter Builder: build letters from the client's real items; approval happens before anything is mailed.", "Dispute Dashboard and Next Steps show what to do next for this client."],
    tip: "Nothing is estimated until a report is imported.",
  }],
  ["/app/clients", {
    title: "Clients",
    summary: "Your credit repair clients. Open one to work their profile.",
    steps: ["New client creates the record; the client's ID (CN-…) is on their profile.", "Use the lifecycle filter to see active, archived or every client.", "Search by name or email."],
  }],
  ["/app/operations", {
    title: "CreditOps Workspace",
    summary: "The operational side of credit repair: the work items, assignments and stages behind each client.",
    steps: ["Move work through its stages; the stage history is kept.", "Assign to a teammate; assignments decide who sees what."],
  }],
  ["/app/funding-dashboard", {
    title: "FundingOps Dashboard",
    summary: "Your funding pipeline at a glance: files by stage, what is waiting on whom, lender distribution.",
    steps: ["Queues show files that need a next step.", "Charts read only your own funding files."],
  }],
  ["/app/funding-files/", {
    title: "Funding file",
    summary: "One funding attempt: application, documents, lender matches, offers, closing and renewal.",
    steps: ["Documents: request what the borrower must send; review each upload.", "Matches & Submissions: potential lender fits, then the submissions you make.", "Offers → Closing: record offers, present them, confirm funding.", "Renewal creates a new file linked to this one."],
    tip: "A fit is a potential match against the lender's stated policy, never a promise.",
  }],
  ["/app/funding-files", {
    title: "Funding Files",
    summary: "Every funding attempt, as a list or a pipeline board.",
    steps: ["Drag a file between stages on the Pipeline view; Funded is set only by confirming funding.", "Open a file to work it."],
  }],
  ["/app/lenders", {
    title: "Lenders",
    summary: "Your lender directory: programs, policy versions, contacts and the scorecard.",
    steps: ["Add a lender, then its programs and the policy version you last verified.", "Policy updates show which open files they affect."],
  }],
  ["/app/funding-deals", {
    title: "Deals",
    summary: "Submissions, offers, funded deals, commissions and renewals as one record surface.",
    steps: ["Each tab is a stage of the same deal record; nothing is duplicated.", "Commissions appear once funding is confirmed."],
  }],
  ["/app/metro2", {
    title: "FundingOps Workspace",
    summary: "The operational side of funding: work items, assignments and stages behind each file.",
    steps: ["Move work through its stages; assign to a teammate.", "Funding files themselves live under Funding Files."],
  }],
  ["/app/reporting", {
    title: "Reports",
    summary: "Your organization's figures: KPIs, production, outcomes and the pivot builder.",
    steps: ["Pick a period; the KPI cards use the KPIs chosen in Settings.", "The pivot builder groups any figure by person, department, client or month.", "Export needs the Export permission."],
  }],
  ["/app/my-time", {
    title: "Time Tracking",
    summary: "Start and stop time on what you are working on. Time feeds production and End of Day.",
    steps: ["Start a timer on a work item or a general activity.", "Stop it when you switch; edits keep a history."],
  }],
  ["/app/eod", {
    title: "End of Day",
    summary: "Your daily summary: what you worked on, time logged, production.",
    steps: ["Review the day, add notes, submit.", "Managers see the team's submissions in Reports."],
  }],
  ["/app/settings", {
    title: "Settings",
    summary: "Your organization's setup: branding, team, roles, letters, KPIs, plan.",
    steps: ["Team Members: invite people and set their role.", "Roles & access: what each role may open and do.", "Letter Library: the approved letters your team builds from."],
    tip: "You only see the sections your role may change.",
  }],
  ["/app/announcements", {
    title: "Announcements",
    summary: "Updates for everyone in your organization, plus notices from the platform.",
    steps: ["Administrators post, pin and archive.", "Pinned items stay on top."],
  }],
  ["/app/education", {
    title: "Knowledge Base",
    summary: "Your procedures and guides, plus reference material on credit reporting law.",
    steps: ["Administrators write articles by category.", "Reference guides are read-only background material, not legal advice."],
  }],
  ["/app/notifications", {
    title: "Notifications",
    summary: "What happened on work you follow or that was assigned to you.",
    steps: ["Open a notification to go to the record.", "Mark all read when you are caught up."],
  }],
  ["/app/compliance", {
    title: "Compliance & Billing",
    summary: "Agreements, disclosures and your plan.",
    steps: ["Keep client agreements current; approvals reference them.", "Plan changes take effect on the next billing date."],
  }],
  ["/app/diy-management", {
    title: "DIY Credit",
    summary: "Your white-label self-service credit program for consumers.",
    steps: ["Consumers, invitations, plans and branding are managed here.", "This module is being built; screens show sample content until it is live."],
  }],
  ["/app/attention", {
    title: "Attention",
    summary: "Work that is blocked, overdue or waiting too long.",
    steps: ["Clear the reason, or reassign.", "Items leave this list on their own when resolved."],
  }],
  ["/app/subaccounts", {
    title: "Organizations",
    summary: "Every customer organization on the platform.",
    steps: ["Open an organization to work in its view.", "Entitlements decide which modules it has."],
  }],
  ["/app", {
    title: "Home",
    summary: "Your starting point. Use the menu on the left to move between areas.",
    steps: ["Search finds clients, files and work across the organization.", "The bell shows what changed on work you follow."],
  }],
];

export function helpFor(pathname: string): PageHelp | null {
  let best: [string, PageHelp] | null = null;
  for (const entry of HELP) {
    if (pathname.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

export const HELP_ROUTE_COUNT = HELP.length;

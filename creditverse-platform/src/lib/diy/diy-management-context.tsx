import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import type {
  OrganizationEntitlements,
  WhiteLabelConfig,
  Person,
  DiyEnrollment,
  CreditOpsEnrollment,
  FundingOpsEnrollment,
  ConversionRecord,
  ActivityEvent,
  ReportSnapshot,
  DiyJourneyStep,
} from "./diy-domain";
import { DEFAULT_WHITE_LABEL, ALL_ENTITLED } from "./diy-domain";

interface DiyManagementContextValue {
  // Organization (B2B) — the company that offers DIY to its consumers
  orgName: string;
  setOrgName: (n: string) => void;
  entitlements: OrganizationEntitlements;
  setEntitlements: (e: OrganizationEntitlements) => void;
  whiteLabel: WhiteLabelConfig;
  setWhiteLabel: (w: WhiteLabelConfig) => void;

  // Consumers (the Organization's own clients)
  people: Person[];
  conversions: ConversionRecord[];
  activity: ActivityEvent[];
  snapshots: Record<string, ReportSnapshot>;

  // Actions
  inviteConsumer: (email: string, name?: string) => Person | undefined;
  requestManagedCredit: (personId: string) => void;
  requestFundingReadiness: (personId: string) => void;
  acceptConversion: (personId: string) => void;
  declineConversion: (personId: string) => void;
  logActivity: (
    personId: string,
    type: string,
    label: string,
    detail?: string,
  ) => void;
}

const DiyMgmtContext = createContext<DiyManagementContextValue | null>(null);

const now = () =>
  new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

// ---------------------------------------------------------------------------
// Demo data — realistic, no invented revenue or success claims
// ---------------------------------------------------------------------------

const demoPeople: Person[] = [
  {
    id: "per-1",
    name: "Maria Torres",
    email: "maria.torres@example.com",
    phone: "(305) 555-0148",
    currentAddress: "1420 NW 12th Ave, Miami, FL 33136",
    status: "active",
    createdAt: "Jun 12, 2026",
    attribution: {
      partnerId: "org-self",
      partnerName: "Summit Credit Solutions",
      referralCode: "SUMMIT",
      firstReferralDate: "Jun 12, 2026",
      source: "BES DIY Credit",
    },
    diy: {
      personId: "per-1",
      status: "in-progress",
      journeyStep: "review-accounts",
      signupDate: "Jun 12, 2026",
      plan: "monthly",
      progressPct: 48,
      lastReportDate: "Aug 18, 2026",
      nextReviewDate: "Sep 18, 2026",
    },
    creditops: {
      personId: "per-1",
      status: "suggested",
    },
  },
  {
    id: "per-2",
    name: "James Carter",
    email: "james.carter@example.com",
    phone: "(404) 555-0921",
    status: "active",
    createdAt: "Jul 02, 2026",
    attribution: {
      partnerId: "org-self",
      partnerName: "Summit Credit Solutions",
      referralCode: "SUMMIT",
      firstReferralDate: "Jul 02, 2026",
      source: "BES DIY Credit",
    },
    diy: {
      personId: "per-2",
      status: "in-progress",
      journeyStep: "upload-evidence",
      signupDate: "Jul 02, 2026",
      plan: "monthly",
      progressPct: 72,
      lastReportDate: "Aug 22, 2026",
    },
  },
  {
    id: "per-3",
    name: "Dana Whitfield",
    email: "dana.w@example.com",
    phone: "(702) 555-3380",
    status: "active",
    createdAt: "Jul 18, 2026",
    attribution: {
      partnerId: "org-self",
      partnerName: "Summit Credit Solutions",
      referralCode: "SUMMIT",
      firstReferralDate: "Jul 18, 2026",
      source: "BES DIY Credit",
    },
    diy: {
      personId: "per-3",
      status: "awaiting-reimport",
      journeyStep: "wait-monitor",
      signupDate: "Jul 18, 2026",
      plan: "included",
      progressPct: 85,
      lastReportDate: "Aug 10, 2026",
    },
    fundingops: {
      personId: "per-3",
      status: "requested",
      fundingGoal: "Working capital",
      requestedAmount: 75000,
    },
  },
  {
    id: "per-4",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    phone: "(206) 555-7711",
    status: "invited",
    createdAt: "Aug 24, 2026",
    attribution: {
      partnerId: "org-self",
      partnerName: "Summit Credit Solutions",
      referralCode: "SUMMIT",
      firstReferralDate: "Aug 24, 2026",
      source: "BES DIY Credit",
    },
    diy: {
      personId: "per-4",
      status: "joined",
      journeyStep: "consent",
      signupDate: "Aug 24, 2026",
      plan: "invite",
      progressPct: 5,
    },
  },
  {
    id: "per-5",
    name: "Anthony Ramos",
    email: "anthony.r@example.com",
    phone: "(713) 555-2244",
    status: "active",
    createdAt: "May 28, 2026",
    attribution: {
      partnerId: "org-self",
      partnerName: "Summit Credit Solutions",
      referralCode: "SUMMIT",
      firstReferralDate: "May 28, 2026",
      source: "BES DIY Credit",
    },
    diy: {
      personId: "per-5",
      status: "completed",
      journeyStep: "progress-review",
      signupDate: "May 28, 2026",
      plan: "one-time",
      progressPct: 100,
      lastReportDate: "Aug 15, 2026",
    },
    creditops: {
      personId: "per-5",
      status: "active",
      caseId: "CR-2041",
      activatedDate: "Jun 30, 2026",
    },
  },
  {
    id: "per-6",
    name: "Selena Ortiz",
    email: "selena.o@example.com",
    phone: "(312) 555-6699",
    status: "active",
    createdAt: "Jun 05, 2026",
    attribution: {
      partnerId: "org-self",
      partnerName: "Summit Credit Solutions",
      referralCode: "SUMMIT",
      firstReferralDate: "Jun 05, 2026",
      source: "BES DIY Credit",
    },
    diy: {
      personId: "per-6",
      status: "in-progress",
      journeyStep: "identify-issues",
      signupDate: "Jun 05, 2026",
      plan: "monthly",
      progressPct: 38,
      lastReportDate: "Aug 20, 2026",
    },
    fundingops: {
      personId: "per-6",
      status: "active",
      dealId: "FD-1098",
      fundingGoal: "Equipment financing",
      requestedAmount: 45000,
    },
  },
];

const demoConversions: ConversionRecord[] = [
  {
    id: "conv-1",
    personId: "per-5",
    type: "diy_to_managed_credit",
    state: "completed",
    createdDate: "Jun 25, 2026",
    completedDate: "Jun 30, 2026",
    note: "Consumer requested Done-For-You help; CreditOps case CR-2041 activated.",
  },
  {
    id: "conv-2",
    personId: "per-3",
    type: "diy_to_funding_readiness",
    state: "requested",
    createdDate: "Aug 20, 2026",
    note: "Consumer indicated a funding goal during DIY journey.",
  },
  {
    id: "conv-3",
    personId: "per-6",
    type: "diy_to_fundingops",
    state: "completed",
    createdDate: "Jul 10, 2026",
    completedDate: "Jul 15, 2026",
    note: "FundingOps deal FD-1098 linked to same client.",
  },
];

const demoActivity: ActivityEvent[] = [
  {
    id: "a1",
    personId: "per-1",
    type: "import",
    label: "Report imported (SmartCredit)",
    date: "Aug 18, 2026",
  },
  {
    id: "a2",
    personId: "per-1",
    type: "issue",
    label: "3 potential issues identified",
    date: "Aug 18, 2026",
  },
  {
    id: "a3",
    personId: "per-2",
    type: "evidence",
    label: "2 documents uploaded",
    date: "Aug 22, 2026",
  },
  {
    id: "a4",
    personId: "per-3",
    type: "conversion",
    label: "Funding readiness requested",
    date: "Aug 20, 2026",
  },
  {
    id: "a5",
    personId: "per-5",
    type: "conversion",
    label: "Converted to managed CreditOps",
    date: "Jun 30, 2026",
  },
  {
    id: "a6",
    personId: "per-6",
    type: "conversion",
    label: "FundingOps deal linked",
    date: "Jul 15, 2026",
  },
  {
    id: "a7",
    personId: "per-4",
    type: "invite",
    label: "Invited to DIY Credit",
    date: "Aug 24, 2026",
  },
];

const demoSnapshots: Record<string, ReportSnapshot> = {
  "per-1": {
    id: "snap-1",
    personId: "per-1",
    importedAt: "Aug 18, 2026",
    provider: "SmartCredit",
    state: "analysis-complete",
    scores: { eq: 612, ex: 598, tu: 605 },
    issues: [
      {
        id: "iss-1",
        accountName: "Portfolio Recovery",
        accountNumber: "****9442",
        bureau: "EX",
        field: "Balance",
        reportedValue: "$1,284",
        whyFlagged: "Balance reported by EX differs from EQ/TU.",
        status: "potential",
        evidenceIds: [],
        consumerConfirmed: false,
        attested: false,
      },
      {
        id: "iss-2",
        accountName: "LVNV Funding",
        accountNumber: "****7701",
        bureau: "EQ",
        field: "DOFD",
        reportedValue: "11/2023",
        whyFlagged: "DOFD appears inconsistent with delinquency chronology.",
        status: "needs-confirmation",
        evidenceIds: [],
        consumerConfirmed: false,
        attested: false,
      },
    ],
  },
};

export const DiyManagementProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [orgName, setOrgName] = useState("Summit Credit Solutions");
  const [entitlements, setEntitlements] =
    useState<OrganizationEntitlements>(ALL_ENTITLED);
  const [whiteLabel, setWhiteLabel] = useState<WhiteLabelConfig>({
    ...DEFAULT_WHITE_LABEL,
    programName: "Summit Credit Builder",
    supportEmail: "help@summitcredit.com",
    supportPhone: "(305) 555-0100",
  });
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [conversions, setConversions] =
    useState<ConversionRecord[]>(demoConversions);
  const [activity, setActivity] = useState<ActivityEvent[]>(demoActivity);
  const [snapshots] = useState<Record<string, ReportSnapshot>>(demoSnapshots);

  const inviteConsumer = (email: string, name?: string) => {
    const existing = people.find(
      (p) => p.email.toLowerCase() === email.toLowerCase(),
    );
    if (existing) return existing; // never duplicate
    const id = `per-${people.length + 1}`;
    const person: Person = {
      id,
      name: name || email.split("@")[0],
      email,
      status: "invited",
      createdAt: now(),
      attribution: {
        partnerId: "org-self",
        partnerName: orgName,
        referralCode: "SUMMIT",
        firstReferralDate: now(),
        source: "BES DIY Credit",
      },
      diy: {
        personId: id,
        status: "invited",
        journeyStep: "join",
        signupDate: now(),
        plan: "invite",
        progressPct: 0,
      },
    };
    setPeople((prev) => [...prev, person]);
    setActivity((prev) => [
      {
        id: `a-${Date.now()}`,
        personId: id,
        type: "invite",
        label: "Invited to DIY Credit",
        date: now(),
      },
      ...prev,
    ]);
    return person;
  };

  const requestManagedCredit = (personId: string) => {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              creditops: {
                personId,
                status: "requested",
              } as CreditOpsEnrollment,
            }
          : p,
      ),
    );
    setConversions((prev) => [
      {
        id: `conv-${Date.now()}`,
        personId,
        type: "diy_to_managed_credit",
        state: "requested",
        createdDate: now(),
        note: "Consumer requested Done-For-You help via DIY portal.",
      },
      ...prev,
    ]);
    setActivity((prev) => [
      {
        id: `a-${Date.now()}`,
        personId,
        type: "conversion",
        label: "Managed credit requested",
        date: now(),
      },
      ...prev,
    ]);
  };

  const requestFundingReadiness = (personId: string) => {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              fundingops: {
                personId,
                status: "requested",
              } as FundingOpsEnrollment,
            }
          : p,
      ),
    );
    setConversions((prev) => [
      {
        id: `conv-${Date.now()}`,
        personId,
        type: "diy_to_funding_readiness",
        state: "requested",
        createdDate: now(),
        note: "Consumer indicated a funding goal during DIY journey.",
      },
      ...prev,
    ]);
    setActivity((prev) => [
      {
        id: `a-${Date.now()}`,
        personId,
        type: "conversion",
        label: "Funding readiness requested",
        date: now(),
      },
      ...prev,
    ]);
  };

  const acceptConversion = (personId: string) => {
    setConversions((prev) =>
      prev.map((c) =>
        c.personId === personId && c.state === "requested"
          ? { ...c, state: "accepted", completedDate: now() }
          : c,
      ),
    );
  };

  const declineConversion = (personId: string) => {
    setConversions((prev) =>
      prev.map((c) =>
        c.personId === personId && c.state === "requested"
          ? { ...c, state: "declined" }
          : c,
      ),
    );
  };

  const logActivity = (
    personId: string,
    type: string,
    label: string,
    detail?: string,
  ) =>
    setActivity((prev) => [
      { id: `a-${Date.now()}`, personId, type, label, date: now(), detail },
      ...prev,
    ]);

  const value = useMemo<DiyManagementContextValue>(
    () => ({
      orgName,
      setOrgName,
      entitlements,
      setEntitlements,
      whiteLabel,
      setWhiteLabel,
      people,
      conversions,
      activity,
      snapshots,
      inviteConsumer,
      requestManagedCredit,
      requestFundingReadiness,
      acceptConversion,
      declineConversion,
      logActivity,
    }),
    [
      orgName,
      entitlements,
      whiteLabel,
      people,
      conversions,
      activity,
      snapshots,
    ],
  );

  return (
    <DiyMgmtContext.Provider value={value}>{children}</DiyMgmtContext.Provider>
  );
};

export const useDiyManagement = () => {
  const ctx = useContext(DiyMgmtContext);
  if (!ctx)
    throw new Error(
      "useDiyManagement must be used within DiyManagementProvider",
    );
  return ctx;
};

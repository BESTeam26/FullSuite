import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import type {
  Partner,
  Person,
  LeadOpportunity,
  CommissionRecord,
  CommissionRule,
  ReferralAttribution,
  ServiceInterest,
  LeadType,
} from "./referral-types";

interface ReferralContextValue {
  // current partner viewing the partner dashboard
  currentPartnerId: string;
  setCurrentPartnerId: (id: string) => void;

  partners: Partner[];
  people: Person[];
  leads: LeadOpportunity[];
  commissions: CommissionRecord[];
  rules: CommissionRule[];

  // attribution
  attributionFor: (personId: string) => ReferralAttribution | undefined;
  peopleForPartner: (partnerId: string) => Person[];
  leadsForPartner: (partnerId: string) => LeadOpportunity[];
  commissionsForPartner: (partnerId: string) => CommissionRecord[];

  // actions
  requestProfessionalHelp: (personId: string) => LeadOpportunity | undefined;
  requestFundingReview: (personId: string) => LeadOpportunity | undefined;
  setServiceInterest: (personId: string, interest: ServiceInterest) => void;
  convertToProfessional: (personId: string) => void;
  convertToFunding: (personId: string) => void;

  // stats
  partnerStats: (partnerId: string) => PartnerStats;
}

export interface PartnerStats {
  clicks: number;
  signups: number;
  payingConsumers: number;
  activeDiy: number;
  professionalHelpRequests: number;
  fundingRequests: number;
  conversions: number;
  commissionEarned: number;
  pendingCommission: number;
  paidCommission: number;
}

const ReferralContext = createContext<ReferralContextValue | null>(null);

// ---- Seed data -----------------------------------------------------------

const partners: Partner[] = [
  {
    id: "p-credit",
    name: "Summit Credit Solutions",
    type: "creditops",
    referralCode: "SUMMIT",
    referralLink: "https://bes.app/diy?ref=SUMMIT",
    offersCredit: true,
    offersFunding: false,
  },
  {
    id: "p-fund",
    name: "Apex Funding Group",
    type: "fundingops",
    referralCode: "APEXFUND",
    referralLink: "https://bes.app/diy?ref=APEXFUND",
    offersCredit: false,
    offersFunding: true,
  },
  {
    id: "p-both",
    name: "Empire Credit + Funding",
    type: "full-suite",
    referralCode: "EMPIRE",
    referralLink: "https://bes.app/diy?ref=EMPIRE",
    offersCredit: true,
    offersFunding: true,
  },
];

const besDirect: Partner = {
  id: "bes-direct",
  name: "BES Direct",
  type: "bes-direct",
  referralCode: "DIRECT",
  referralLink: "https://bes.app/diy",
  offersCredit: false,
  offersFunding: false,
};

const allPartners = [...partners, besDirect];

const mkAttribution = (
  personId: string,
  partner: Partner,
  date: string,
): ReferralAttribution => ({
  personId,
  partnerId: partner.id,
  partnerType: partner.type,
  referralCode: partner.referralCode,
  referralLink: partner.referralLink,
  firstReferralDate: date,
  source: partner.id === "bes-direct" ? "Direct" : "BES DIY Credit",
  original: true,
});

const people: Person[] = [
  {
    id: "c-1",
    name: "Maria Alvarez",
    email: "maria.a@example.com",
    phone: "(305) 555-0148",
    attribution: mkAttribution("c-1", partners[2], "Jul 12, 2026"),
    enrollment: {
      personId: "c-1",
      status: "active",
      signupDate: "Jul 12, 2026",
      serviceInterest: "business_funding",
      progressPct: 62,
    },
    subscription: {
      personId: "c-1",
      status: "active",
      plan: "DIY Monthly",
      amount: 39,
      startedDate: "Jul 12, 2026",
    },
    fundingInterest: true,
    professionalHelpInterest: false,
  },
  {
    id: "c-2",
    name: "James Carter",
    email: "james.c@example.com",
    attribution: mkAttribution("c-2", partners[0], "Aug 02, 2026"),
    enrollment: {
      personId: "c-2",
      status: "active",
      signupDate: "Aug 02, 2026",
      serviceInterest: "professional_credit",
      progressPct: 28,
    },
    subscription: {
      personId: "c-2",
      status: "active",
      plan: "DIY Monthly",
      amount: 39,
      startedDate: "Aug 02, 2026",
    },
    fundingInterest: false,
    professionalHelpInterest: true,
  },
  {
    id: "c-3",
    name: "Dana Whitfield",
    email: "dana.w@example.com",
    attribution: mkAttribution("c-3", partners[1], "Aug 18, 2026"),
    enrollment: {
      personId: "c-3",
      status: "trial",
      signupDate: "Aug 18, 2026",
      serviceInterest: "none",
      progressPct: 8,
    },
    subscription: {
      personId: "c-3",
      status: "trialing",
      plan: "DIY Trial",
      amount: 0,
      startedDate: "Aug 18, 2026",
    },
    fundingInterest: false,
    professionalHelpInterest: false,
  },
  {
    id: "c-4",
    name: "Priya Nair",
    email: "priya.n@example.com",
    attribution: mkAttribution("c-4", besDirect, "Aug 21, 2026"),
    enrollment: {
      personId: "c-4",
      status: "active",
      signupDate: "Aug 21, 2026",
      serviceInterest: "none",
      progressPct: 41,
    },
    subscription: {
      personId: "c-4",
      status: "active",
      plan: "DIY Monthly",
      amount: 39,
      startedDate: "Aug 21, 2026",
    },
    fundingInterest: false,
    professionalHelpInterest: false,
  },
];

const leads: LeadOpportunity[] = [
  {
    id: "l-1",
    personId: "c-1",
    type: "funding_request",
    stage: "opportunity",
    createdDate: "Aug 24, 2026",
    partnerId: "p-both",
    serviceInterest: "business_funding",
    note: "Consumer requested a funding readiness review via DIY CTA.",
  },
  {
    id: "l-2",
    personId: "c-2",
    type: "professional_help_request",
    stage: "contacted",
    createdDate: "Aug 22, 2026",
    partnerId: "p-credit",
    serviceInterest: "professional_credit",
    note: "Consumer requested Done-For-You credit help via DIY CTA.",
  },
];

const rules: CommissionRule[] = [
  {
    id: "r-1",
    name: "DIY Signup (trial)",
    trigger: "diy_signup",
    type: "flat",
    value: 0,
    delayDays: 0,
    active: true,
  },
  {
    id: "r-2",
    name: "DIY Paid Conversion",
    trigger: "diy_conversion",
    type: "percent",
    value: 20,
    delayDays: 30,
    active: true,
  },
  {
    id: "r-3",
    name: "Professional Credit Conversion",
    trigger: "professional_conversion",
    type: "percent",
    value: 15,
    delayDays: 45,
    active: true,
  },
  {
    id: "r-4",
    name: "Funding Conversion",
    trigger: "funding_conversion",
    type: "percent",
    value: 10,
    delayDays: 60,
    active: true,
  },
];

const commissions: CommissionRecord[] = [
  {
    id: "cm-1",
    personId: "c-1",
    partnerId: "p-both",
    state: "eligible",
    amount: 7.8,
    createdDate: "Aug 12, 2026",
    ruleId: "r-2",
  },
  {
    id: "cm-2",
    personId: "c-2",
    partnerId: "p-credit",
    state: "pending",
    amount: 7.8,
    createdDate: "Sep 02, 2026",
    ruleId: "r-2",
  },
  {
    id: "cm-3",
    personId: "c-1",
    partnerId: "p-both",
    state: "paid",
    amount: 7.8,
    createdDate: "Jul 12, 2026",
    paidDate: "Aug 12, 2026",
    ruleId: "r-2",
  },
];

export const ReferralProvider = ({ children }: { children: ReactNode }) => {
  const [currentPartnerId, setCurrentPartnerId] = useState("p-both");
  const [peopleState, setPeopleState] = useState<Person[]>(people);
  const [leadsState, setLeadsState] = useState<LeadOpportunity[]>(leads);
  const [commissionsState] = useState<CommissionRecord[]>(commissions);

  const attributionFor = (personId: string) =>
    peopleState.find((p) => p.id === personId)?.attribution;

  const peopleForPartner = (partnerId: string) =>
    peopleState.filter((p) => p.attribution.partnerId === partnerId);

  const leadsForPartner = (partnerId: string) =>
    leadsState.filter((l) => l.partnerId === partnerId);

  const commissionsForPartner = (partnerId: string) =>
    commissionsState.filter((c) => c.partnerId === partnerId);

  const createLead = (
    personId: string,
    type: LeadType,
    note: string,
  ): LeadOpportunity | undefined => {
    const person = peopleState.find((p) => p.id === personId);
    if (!person) return undefined;
    const partnerId = person.attribution.partnerId;
    const lead: LeadOpportunity = {
      id: `l-${Date.now()}`,
      personId,
      type,
      stage: "new",
      createdDate: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
      partnerId,
      serviceInterest:
        type === "funding_request" || type === "funding_readiness_reassessment"
          ? "business_funding"
          : "professional_credit",
      note,
    };
    setLeadsState((prev) => [lead, ...prev]);
    return lead;
  };

  const requestProfessionalHelp = (personId: string) =>
    createLead(
      personId,
      "professional_help_request",
      "Consumer requested Done-For-You help via DIY CTA.",
    );

  const requestFundingReview = (personId: string) =>
    createLead(
      personId,
      "funding_request",
      "Consumer requested a funding readiness review via DIY CTA.",
    );

  const setServiceInterest = (personId: string, interest: ServiceInterest) =>
    setPeopleState((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              serviceInterest: interest,
              enrollment: { ...p.enrollment, serviceInterest: interest },
              professionalHelpInterest:
                interest === "professional_credit" || interest === "both",
              fundingInterest:
                interest === "business_funding" || interest === "both",
            }
          : p,
      ),
    );

  const convertToProfessional = (personId: string) => {
    setPeopleState((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              enrollment: { ...p.enrollment, status: "converted" as never },
              professionalHelpInterest: true,
            }
          : p,
      ),
    );
    createLead(
      personId,
      "professional_help_request",
      "Converted from DIY to managed CreditOps.",
    );
  };

  const convertToFunding = (personId: string) => {
    setPeopleState((prev) =>
      prev.map((p) =>
        p.id === personId ? { ...p, fundingInterest: true } : p,
      ),
    );
    createLead(
      personId,
      "funding_request",
      "Converted from DIY to FundingOps.",
    );
  };

  const partnerStats = (partnerId: string): PartnerStats => {
    const ps = peopleForPartner(partnerId);
    const cs = commissionsForPartner(partnerId);
    const ls = leadsForPartner(partnerId);
    return {
      clicks: ps.length * 7 + 12,
      signups: ps.length,
      payingConsumers: ps.filter(
        (p) => p.subscription.status === "active" && p.subscription.amount > 0,
      ).length,
      activeDiy: ps.filter((p) => p.enrollment.status === "active").length,
      professionalHelpRequests: ls.filter(
        (l) => l.type === "professional_help_request",
      ).length,
      fundingRequests: ls.filter(
        (l) =>
          l.type === "funding_request" ||
          l.type === "funding_readiness_reassessment",
      ).length,
      conversions: ps.filter(
        (p) => p.professionalHelpInterest || p.fundingInterest,
      ).length,
      commissionEarned: cs
        .filter((c) => c.state === "paid")
        .reduce((s, c) => s + c.amount, 0),
      pendingCommission: cs
        .filter((c) => c.state === "pending" || c.state === "eligible")
        .reduce((s, c) => s + c.amount, 0),
      paidCommission: cs
        .filter((c) => c.state === "paid")
        .reduce((s, c) => s + c.amount, 0),
    };
  };

  const value = useMemo<ReferralContextValue>(
    () => ({
      currentPartnerId,
      setCurrentPartnerId,
      partners: allPartners,
      people: peopleState,
      leads: leadsState,
      commissions: commissionsState,
      rules,
      attributionFor,
      peopleForPartner,
      leadsForPartner,
      commissionsForPartner,
      requestProfessionalHelp,
      requestFundingReview,
      setServiceInterest,
      convertToProfessional,
      convertToFunding,
      partnerStats,
    }),
    [currentPartnerId, peopleState, leadsState, commissionsState],
  );

  return (
    <ReferralContext.Provider value={value}>
      {children}
    </ReferralContext.Provider>
  );
};

export const useReferral = () => {
  const ctx = useContext(ReferralContext);
  if (!ctx) throw new Error("useReferral must be used within ReferralProvider");
  return ctx;
};

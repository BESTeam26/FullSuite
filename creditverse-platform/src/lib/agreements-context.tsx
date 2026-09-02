import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface Agreement {
  id: string;
  name: string;
  type: "Standard" | "Couples" | "DIY" | "Custom";
  status: "active" | "draft";
  version: string;
  updatedAt: string;
  hasCroaDisclosures: boolean;
  body: string;
  firstAmount?: string;
  monthlyAmount?: string;
  couplesFirst?: string;
  couplesMonthly?: string;
}

const DEFAULT_AGREEMENTS: Agreement[] = [
  {
    id: "agr-standard",
    name: "Standard Credit Services Agreement",
    type: "Standard",
    status: "active",
    version: "v2.1",
    updatedAt: "Aug 12, 2026",
    hasCroaDisclosures: true,
    firstAmount: "",
    monthlyAmount: "",
    couplesFirst: "",
    couplesMonthly: "",
    body: `STANDARD CREDIT SERVICES AGREEMENT

This Credit Services Agreement ("Agreement") is entered into between the Credit Services Organization ("CSO") and the Consumer identified on the signature page.

1. SERVICES
The CSO will provide credit report analysis, dispute preparation assistance, and credit education services as described in the service plan selected.

2. CROA DISCLOSURES (Required by 15 U.S.C. §1679)
(a) You have the right to dispute inaccurate or incomplete information in your credit file directly with the consumer reporting agency or the furnisher of the information.
(b) You may, on your own, dispute inaccurate or incomplete information without cost by contacting the credit bureau directly.
(c) A consumer reporting agency may not charge for blocking or removing information that results from identity theft.
(d) You have the right to obtain a copy of your credit report from each nationwide consumer reporting agency once every 12 months for free. Visit annualcreditreport.com.

3. NO ADVANCE PAYMENT
You will not be charged for any service until that service has been fully performed, as required by the Credit Repair Organizations Act.

4. CANCELLATION RIGHTS
You may cancel this Agreement within three (3) business days after signing without any penalty or obligation. See the Notice of Cancellation form attached.

5. NO GUARANTEES
The CSO does not guarantee the removal of any specific item from your credit report or any specific increase in your credit score. Accurate, verifiable, and timely information may not be removed.

6. CONSUMER STATEMENTS
You agree that all information you provide regarding disputes will be truthful and accurate to the best of your knowledge.`,
  },
  {
    id: "agr-couples",
    name: "Couples Joint Agreement",
    type: "Couples",
    status: "active",
    version: "v1.4",
    updatedAt: "Jul 30, 2026",
    hasCroaDisclosures: true,
    body: `COUPLES JOINT CREDIT SERVICES AGREEMENT

This Agreement covers two (2) consumers in a household. All CROA disclosures from the Standard Agreement apply to both parties individually.`,
    firstAmount: "",
    monthlyAmount: "",
    couplesFirst: "",
    couplesMonthly: "",
  },
  {
    id: "agr-diy",
    name: "DIY Credit Education Agreement",
    type: "DIY",
    status: "active",
    version: "v1.0",
    updatedAt: "Aug 01, 2026",
    hasCroaDisclosures: true,
    body: `DIY CREDIT EDUCATION TOOL AGREEMENT

This Agreement covers use of the self-service credit education and dispute preparation tools. The platform does not perform credit repair on your behalf. All CROA disclosures apply.`,
    firstAmount: "",
    monthlyAmount: "",
    couplesFirst: "",
    couplesMonthly: "",
  },
];

interface AgreementsValue {
  agreements: Agreement[];
  addAgreement: (a: Omit<Agreement, "id">) => void;
  updateAgreement: (id: string, patch: Partial<Agreement>) => void;
  removeAgreement: (id: string) => void;
}

const AgreementsContext = createContext<AgreementsValue>({
  agreements: DEFAULT_AGREEMENTS,
  addAgreement: () => {},
  updateAgreement: () => {},
  removeAgreement: () => {},
});

export const AgreementsProvider = ({ children }: { children: ReactNode }) => {
  const [agreements, setAgreements] = useState<Agreement[]>(DEFAULT_AGREEMENTS);

  const value = useMemo<AgreementsValue>(
    () => ({
      agreements,
      addAgreement: (a) =>
        setAgreements((prev) => [...prev, { ...a, id: crypto.randomUUID() }]),
      updateAgreement: (id, patch) =>
        setAgreements((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        ),
      removeAgreement: (id) =>
        setAgreements((prev) => prev.filter((a) => a.id !== id)),
    }),
    [agreements],
  );

  return (
    <AgreementsContext.Provider value={value}>
      {children}
    </AgreementsContext.Provider>
  );
};

export const useAgreements = () => useContext(AgreementsContext);

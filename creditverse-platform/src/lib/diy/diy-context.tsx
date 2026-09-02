import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import {
  classifyReport,
  type ClassifiedItem,
} from "@/lib/credit-classification";
import { sampleRaw } from "@/lib/sample-credit-report";
import {
  initialItemRound,
  type ItemRoundState,
  type RoundStage,
  type RoundStatus,
} from "@/lib/diy/round-logic";

export type DiyView =
  | "dashboard"
  | "import"
  | "disputes"
  | "letters"
  | "mail"
  | "progress"
  | "learn"
  | "documents"
  | "rounds"
  | "settings";

export interface DisputeDraft {
  itemId: string;
  reason: string;
  recipient: "CRA" | "Furnisher" | "Regulator" | "Attorney";
  attested: boolean;
  evidence: string[];
  status: "draft" | "ready" | "sent";
  letterBody?: string;
}

export interface MailPiece {
  id: string;
  recipient: string;
  items: string[];
  tracking: string;
  sentDate: string;
  status: "Printed" | "Mailed" | "In Transit" | "Delivered" | "Returned";
  method: "USPS Certified" | "USPS First Class" | "Electronic";
}

interface DiyContextValue {
  view: DiyView;
  setView: (v: DiyView) => void;
  items: ClassifiedItem[];
  setItems: React.Dispatch<React.SetStateAction<ClassifiedItem[]>>;
  imported: boolean;
  setImported: (b: boolean) => void;
  drafts: Record<string, DisputeDraft>;
  setDraft: (itemId: string, patch: Partial<DisputeDraft>) => void;
  mail: MailPiece[];
  addMail: (m: MailPiece) => void;
  rounds: Record<string, ItemRoundState>;
  advanceRound: (itemId: string, to?: RoundStage) => void;
  setRoundStatus: (itemId: string, status: RoundStatus) => void;
  logRoundEvent: (itemId: string, note: string) => void;
}

const DiyContext = createContext<DiyContextValue | null>(null);

const initialItems = classifyReport(sampleRaw);

const initialDrafts: Record<string, DisputeDraft> = {};
for (const it of initialItems) {
  if (it.disposition === "dispute") {
    initialDrafts[it.id] = {
      itemId: it.id,
      reason: "",
      recipient: "CRA",
      attested: false,
      evidence: [],
      status: "draft",
    };
  }
}

const initialMail: MailPiece[] = [
  {
    id: "m1",
    recipient: "Equifax Dispute Department",
    items: ["Midland Funding LLC", "Chase Bank"],
    tracking: "9405 5018 9956 0001 2345",
    sentDate: "Aug 24, 2026",
    status: "Delivered",
    method: "USPS Certified",
  },
  {
    id: "m2",
    recipient: "Experian Dispute Department",
    items: ["Portfolio Recovery Associates"],
    tracking: "9405 5018 9956 0002 4567",
    sentDate: "Aug 24, 2026",
    status: "In Transit",
    method: "USPS Certified",
  },
  {
    id: "m3",
    recipient: "Midland Funding LLC",
    items: ["Midland Funding LLC"],
    tracking: "9405 5018 9956 0003 89AB",
    sentDate: "Aug 26, 2026",
    status: "In Transit",
    method: "USPS Certified",
  },
];

const initialRounds: Record<string, ItemRoundState> = {};
for (const it of initialItems) {
  if (it.disposition === "dispute") {
    initialRounds[it.id] = {
      ...initialItemRound(it.id),
      stage: "initial",
      status: "sent",
      sentDate: "Aug 24, 2026",
      history: [
        {
          stage: "initial",
          status: "sent",
          date: "Aug 24, 2026",
          note: "Round 1 dispute mailed to all three CRAs.",
        },
      ],
    };
  }
}

export const DiyProvider = ({ children }: { children: ReactNode }) => {
  const [view, setView] = useState<DiyView>("dashboard");
  const [items, setItems] = useState<ClassifiedItem[]>(initialItems);
  const [imported, setImported] = useState(true);
  const [drafts, setDrafts] =
    useState<Record<string, DisputeDraft>>(initialDrafts);
  const [mail, setMail] = useState<MailPiece[]>(initialMail);
  const [rounds, setRounds] =
    useState<Record<string, ItemRoundState>>(initialRounds);

  const setDraft = (itemId: string, patch: Partial<DisputeDraft>) =>
    setDrafts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));

  const addMail = (m: MailPiece) => setMail((prev) => [m, ...prev]);

  const advanceRound = (itemId: string, to?: RoundStage) => {
    setRounds((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      const stage: RoundStage = to ?? "initial";
      const date = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
      return {
        ...prev,
        [itemId]: {
          ...cur,
          stage,
          status: "drafting",
          sentDate: to ? undefined : cur.sentDate,
          history: [
            ...cur.history,
            {
              stage,
              status: "drafting",
              date,
              note: `Escalated to ${stage} stage.`,
            },
          ],
        },
      };
    });
  };

  const setRoundStatus = (itemId: string, status: RoundStatus) => {
    setRounds((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      return { ...prev, [itemId]: { ...cur, status } };
    });
  };

  const logRoundEvent = (itemId: string, note: string) => {
    setRounds((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      const date = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
      return {
        ...prev,
        [itemId]: {
          ...cur,
          history: [
            ...cur.history,
            { stage: cur.stage, status: cur.status, date, note },
          ],
        },
      };
    });
  };

  const value = useMemo(
    () => ({
      view,
      setView,
      items,
      setItems,
      imported,
      setImported,
      drafts,
      setDraft,
      mail,
      addMail,
      rounds,
      advanceRound,
      setRoundStatus,
      logRoundEvent,
    }),
    [view, items, imported, drafts, mail, rounds],
  );

  return <DiyContext.Provider value={value}>{children}</DiyContext.Provider>;
};

export const useDiy = () => {
  const ctx = useContext(DiyContext);
  if (!ctx) throw new Error("useDiy must be used within DiyProvider");
  return ctx;
};

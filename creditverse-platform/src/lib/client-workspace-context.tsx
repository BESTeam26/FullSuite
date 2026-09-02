import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  classifyReport,
  type ClassifiedItem,
  type Disposition,
} from "@/lib/credit-classification";
import { sampleRaw } from "@/lib/sample-credit-report";

export type ClientTab =
  | "overview"
  | "account"
  | "import"
  | "disputes"
  | "letters"
  | "print"
  | "next-steps"
  | "build"
  | "simulator";

export interface BureauScore {
  key: "equifax" | "experian" | "transunion";
  label: string;
  score: number;
  prev: number;
  first: number;
}

export interface ActiveLetter {
  id: string;
  itemName: string;
  category: string;
  builderMode: string;
  bureaus: string[];
  generatedDate: string;
  dueDate: string;
  status: "draft" | "active" | "in-dispute";
  body: string;
  attachments: string[];
}

interface ClientWorkspaceValue {
  clientId: string;
  items: ClassifiedItem[];
  setItems: React.Dispatch<React.SetStateAction<ClassifiedItem[]>>;
  hasImported: boolean;
  setHasImported: (v: boolean) => void;
  scores: BureauScore[];
  round: number;
  setRound: (r: number) => void;
  tab: ClientTab;
  setTab: (t: ClientTab) => void;
  moveItem: (id: string, disposition: Disposition) => void;
  bulkMove: (ids: string[], disposition: Disposition) => void;
  disputeCount: number;
  deletionCount: number;
  qaPassed: boolean;
  setQaPassed: (v: boolean) => void;
  activeLetters: ActiveLetter[];
  addActiveLetter: (letter: ActiveLetter) => void;
  roundCycleDays: number;
  setRoundCycleDays: (d: number) => void;
}

const defaultScores: BureauScore[] = [
  { key: "equifax", label: "Equifax", score: 654, prev: 642, first: 588 },
  { key: "experian", label: "Experian", score: 660, prev: 651, first: 601 },
  { key: "transunion", label: "TransUnion", score: 635, prev: 624, first: 590 },
];

const ClientWorkspaceContext = createContext<ClientWorkspaceValue>({
  clientId: "1",
  items: [],
  setItems: () => {},
  hasImported: false,
  setHasImported: () => {},
  scores: defaultScores,
  round: 3,
  setRound: () => {},
  tab: "overview",
  setTab: () => {},
  moveItem: () => {},
  bulkMove: () => {},
  disputeCount: 0,
  deletionCount: 0,
  qaPassed: false,
  setQaPassed: () => {},
  activeLetters: [],
  addActiveLetter: () => {},
  roundCycleDays: 35,
  setRoundCycleDays: () => {},
});

export const ClientWorkspaceProvider = ({
  clientId,
  children,
}: {
  clientId: string;
  children: ReactNode;
}) => {
  const [items, setItems] = useState<ClassifiedItem[]>(() =>
    classifyReport(sampleRaw),
  );
  const [hasImported, setHasImported] = useState(true);
  const [round, setRound] = useState(3);
  const [tab, setTab] = useState<ClientTab>("overview");
  const [qaPassed, setQaPassed] = useState(false);
  const [activeLetters, setActiveLetters] = useState<ActiveLetter[]>([]);
  const [roundCycleDays, setRoundCycleDays] = useState(35);

  const moveItem = (id: string, disposition: Disposition) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, disposition } : i)),
    );
  };

  const bulkMove = (ids: string[], disposition: Disposition) => {
    const idSet = new Set(ids);
    setItems((prev) =>
      prev.map((i) => (idSet.has(i.id) ? { ...i, disposition } : i)),
    );
  };

  const addActiveLetter = (letter: ActiveLetter) => {
    setActiveLetters((prev) => [...prev, letter]);
  };

  const value = useMemo<ClientWorkspaceValue>(() => {
    const disputeCount = items.filter(
      (i) => i.disposition === "dispute",
    ).length;
    const deletionCount = items.filter(
      (i) =>
        i.disposition === "dispute" &&
        (i.category === "3rd-Party Collection" || i.category === "Charge-Off"),
    ).length;
    return {
      clientId,
      items,
      setItems,
      hasImported,
      setHasImported,
      scores: defaultScores,
      round,
      setRound,
      tab,
      setTab,
      moveItem,
      bulkMove,
      disputeCount,
      deletionCount,
      qaPassed,
      setQaPassed,
      activeLetters,
      addActiveLetter,
      roundCycleDays,
      setRoundCycleDays,
    };
  }, [
    clientId,
    items,
    hasImported,
    round,
    tab,
    qaPassed,
    activeLetters,
    roundCycleDays,
  ]);

  return (
    <ClientWorkspaceContext.Provider value={value}>
      {children}
    </ClientWorkspaceContext.Provider>
  );
};

export const useClientWorkspace = () => useContext(ClientWorkspaceContext);

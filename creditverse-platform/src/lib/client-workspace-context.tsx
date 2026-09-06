import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useClientReports, useReportItems } from "@/lib/data/use-credit-reports";
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

/** Where the items on screen came from — the interface must say so (rule 12). */
export type ReportSource = "sample" | "live" | "none";

interface ClientWorkspaceValue {
  clientId: string;
  /** "sample" = bundled demo report; "live" = the client's latest imported report; "none" = live client, nothing imported yet. */
  reportSource: ReportSource;
  /** Id of the report the items came from (live only). */
  reportId: string | null;
  reportPulledAt: string | null;
  reportsLoading: boolean;
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
  reportSource: "sample",
  reportId: null,
  reportPulledAt: null,
  reportsLoading: false,
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
  /* Live sessions read the client's latest imported report; the bundled
     sample exists only for demo mode. A live client with no report has no
     items — never the sample (rule 12). Only a real client id (uuid) can have
     reports; the sample-page ids ("1", "2") never hit the database. */
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId);
  const reports = useClientReports(live && isUuid ? clientId : null);
  const latest = reports.latest;
  const reportItems = useReportItems(latest?.id ?? null);
  const reportSource: ReportSource = !live ? "sample" : latest ? "live" : "none";

  const [items, setItems] = useState<ClassifiedItem[]>(() =>
    live ? [] : classifyReport(sampleRaw),
  );
  const [hasImported, setHasImported] = useState(!live);
  useEffect(() => {
    if (!live) return;
    if (latest && !reportItems.isLoading) {
      setItems(classifyReport(reportItems.items));
      setHasImported(true);
    } else if (!latest && !reports.isLoading) {
      setItems([]);
      setHasImported(false);
    }
  }, [live, latest, reportItems.items, reportItems.isLoading, reports.isLoading]);

  /* Bureau scores exactly as the reports state them: current = latest report,
     prev = the one before, first = the oldest we hold. Never computed. */
  const liveScores = useMemo<BureauScore[] | null>(() => {
    if (!live || !latest) return null;
    const byBureau = (bureau: "EQ" | "EX" | "TU", report: (typeof reports.reports)[number] | undefined) =>
      report?.scores.find((sc) => sc.bureau === bureau)?.score ?? 0;
    const oldest = reports.reports[reports.reports.length - 1];
    const prev = reports.reports[1];
    return ([
      ["equifax", "Equifax", "EQ"],
      ["experian", "Experian", "EX"],
      ["transunion", "TransUnion", "TU"],
    ] as const).map(([key, label, bureau]) => ({
      key,
      label,
      score: byBureau(bureau, latest),
      prev: byBureau(bureau, prev),
      first: byBureau(bureau, oldest),
    }));
  }, [live, latest, reports.reports]);
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
      reportSource,
      reportId: latest?.id ?? null,
      reportPulledAt: latest?.pulledAt ?? null,
      reportsLoading: reports.isLoading || reportItems.isLoading,
      items,
      setItems,
      hasImported,
      setHasImported,
      /* A live client with no imported report has no scores — not the sample
         ones. Showing 654/660/635 there put demo numbers under the heading
         "reported score" on a real person's profile (rule 12). The sample set
         belongs to demo mode alone. */
      scores: liveScores ?? (live ? [] : defaultScores),
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
    reportSource,
    latest,
    reports.isLoading,
    reportItems.isLoading,
    liveScores,
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

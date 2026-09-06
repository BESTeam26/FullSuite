import { useState, type ReactNode } from "react";
import {
  Home,
  CreditCard,
  ClipboardList,
  FileCheck2,
  FolderOpen,
  TrendingUp,
  GraduationCap,
  LifeBuoy,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Link } from "react-router-dom";
import { ConsumerHome } from "@/components/diy/consumer/ConsumerHome";
import { ConsumerImport } from "@/components/diy/consumer/ConsumerImport";
import { ConsumerCreditReview } from "@/components/diy/consumer/ConsumerCreditReview";
import { ConsumerTruthGate } from "@/components/diy/consumer/ConsumerTruthGate";
import { ConsumerActionPlan } from "@/components/diy/consumer/ConsumerActionPlan";
import { ConsumerDisputePrep } from "@/components/diy/consumer/ConsumerDisputePrep";
import { ConsumerProgress } from "@/components/diy/consumer/ConsumerProgress";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavigate } from "react-router-dom";
import {
  ConsumerIssues,
  ConsumerEvidence,
  ConsumerDocuments,
  ConsumerEducation,
  ConsumerHelp,
} from "@/components/diy/consumer/ConsumerMisc";

export type ConsumerView =
  | "home"
  | "my-credit"
  | "my-plan"
  | "issues"
  | "evidence"
  | "documents"
  | "progress"
  | "education"
  | "help"
  | "import"
  | "truth-gate"
  | "dispute-prep";

const nav: { key: ConsumerView; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "my-credit", label: "My Credit", icon: CreditCard },
  { key: "my-plan", label: "My Plan", icon: ClipboardList },
  { key: "issues", label: "Issues", icon: FileCheck2 },
  { key: "evidence", label: "Evidence", icon: FileCheck2 },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "progress", label: "Progress", icon: TrendingUp },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "help", label: "Help", icon: LifeBuoy },
];

const renderView = (view: ConsumerView) => {
  switch (view) {
    case "home":
      return <ConsumerHome />;
    case "import":
      return <ConsumerImport />;
    case "my-credit":
      return <ConsumerCreditReview />;
    case "truth-gate":
      return <ConsumerTruthGate />;
    case "my-plan":
      return <ConsumerActionPlan />;
    case "dispute-prep":
      return <ConsumerDisputePrep />;
    case "issues":
      return <ConsumerIssues />;
    case "evidence":
      return <ConsumerEvidence />;
    case "documents":
      return <ConsumerDocuments />;
    case "progress":
      return <ConsumerProgress />;
    case "education":
      return <ConsumerEducation />;
    case "help":
      return <ConsumerHelp />;
    default:
      return <ConsumerHome />;
  }
};

export const DiyConsumerShell = ({ children }: { children?: ReactNode }) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { whiteLabel } = useDiyManagement();
  const [view, setView] = useState<ConsumerView>("home");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-foreground"
              style={{ background: whiteLabel.primaryColor || "var(--green)" }}
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold">{whiteLabel.programName}</p>
              <p className="text-[10px] text-muted-foreground">
                {whiteLabel.portalName || "DIY Credit"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden text-xs text-muted-foreground hover:text-foreground sm:block"
            >
              BES home
            </Link>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Signed in as{" "}
              <span className="font-medium text-foreground">Maria T.</span>
            </span>
            <button type="button" onClick={() => { void signOut(); navigate("/"); }} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-card/40 p-3 md:block">
          <nav className="space-y-1">
            {nav.map((n) => {
              const active = view === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setView(n.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-gradient-gold text-charcoal shadow-glow"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-status-warning">
              You're in control
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {whiteLabel.welcomeCopy ||
                "Nothing is sent on your behalf without your review and approval."}
            </p>
          </div>
        </aside>

        <div className="flex w-full overflow-x-auto border-b border-border px-2 py-2 md:hidden">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                view === n.key
                  ? "bg-gradient-gold text-charcoal"
                  : "text-muted-foreground"
              }`}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </button>
          ))}
        </div>

        <main className="min-w-0 flex-1 p-4 md:p-8">
          {children || renderView(view)}
        </main>
      </div>
    </div>
  );
};

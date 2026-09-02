import { useState } from "react";
import { ArrowRight, Save, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ClassifiedItem,
  Bureau,
  Disposition,
} from "@/lib/credit-classification";
import { ScoreGauge, type BureauScore } from "./reimport/ReImportGauges";
import { ChangeSummarySection } from "./reimport/ReImportChangeCards";
import { ItemTableSection } from "./reimport/ReImportItemTable";
import { ReImportSidebar } from "./reimport/ReImportSidebar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReImportReportProps {
  items: ClassifiedItem[];
  previousItems?: ClassifiedItem[];
  scores?: BureauScore[];
  onSave: (items: ClassifiedItem[]) => void;
  onDiscardSideBySide: () => void;
  onDiscardReimport: () => void;
}

// ─── Default demo data ────────────────────────────────────────────────────────

const defaultScores: BureauScore[] = [
  { bureau: "EQ", score: 733, prevScore: 716, date: "Aug 29th, 2026" },
  { bureau: "EX", score: 684, prevScore: 672, date: "Aug 29th, 2026" },
  { bureau: "TU", score: 705, prevScore: 692, date: "Aug 29th, 2026" },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export const ReImportProgressReport = ({
  items,
  scores = defaultScores,
  onSave,
  onDiscardSideBySide,
  onDiscardReimport,
}: ReImportReportProps) => {
  const [editedItems, setEditedItems] = useState<ClassifiedItem[]>(items);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exposed, setExposed] = useState<Record<string, boolean>>({});

  const toggleExpose = (key: string) =>
    setExposed((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleDisposition = (itemId: string, disp: Disposition) => {
    setEditedItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, disposition: disp } : i)),
    );
  };

  // Derived categories
  const disputedUpdates = editedItems.filter(
    (i) => i.isNegative || i.disposition === "dispute",
  );
  const personalInfo = editedItems.filter((i) => i.kind === "Personal");
  const inquiries = editedItems.filter((i) => i.kind === "Inquiry");
  const newItems = [...personalInfo, ...inquiries];
  const negativeUndisputed = editedItems.filter(
    (i) => i.isNegative && i.disposition !== "dispute",
  );
  const positiveItems = editedItems.filter(
    (i) =>
      i.category === "Open Positive Account" ||
      i.category === "Closed Positive Account",
  );

  return (
    <div className="space-y-5">
      {/* Header Action Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 to-blue-500/5 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-emerald-700">
            Next Action: Save Auto Re-Import
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Review changes below. Edit any item&apos;s classification if needed,
            then save to update the dispute dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="bg-gradient-to-r from-pink-500 to-red-500 text-white"
          >
            Next: Save Auto Re-Import{" "}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline">
            Choose Disputes
          </Button>
          <Button size="sm" variant="outline">
            Build Round Letters
          </Button>
          <Button size="sm" variant="outline">
            Download / Send Letters
          </Button>
          <Button size="sm" variant="outline">
            Update Round
          </Button>
          <button
            onClick={onDiscardReimport}
            className="text-xs font-medium text-red-600 underline hover:text-red-700"
          >
            Discard and Auto Re-Import again?
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left Column */}
        <div className="space-y-5">
          {/* Title Block */}
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm font-semibold text-blue-600">
              MY FREE SCORE NOW
            </p>
            <p className="text-xs text-muted-foreground">
              Know the Score and More
            </p>
            <p className="mt-3 text-base font-bold">
              Credit Report Date Provided by Monitoring Agency: Aug 29th, 2026
            </p>
            <p className="mt-1 text-sm font-semibold">
              Credit Re-Import Summary: Aug 29th, 2026
            </p>
            <p className="text-xs text-muted-foreground">
              Previous report pulled on: Jul 28th, 2026
            </p>
          </div>

          {/* Score Gauges */}
          <div className="grid grid-cols-3 gap-4">
            {scores.map((s) => (
              <ScoreGauge key={s.bureau} data={s} />
            ))}
          </div>

          {/* Change Summary */}
          <ChangeSummarySection />

          {/* Disputed Items Updates */}
          <ItemTableSection
            title="Disputed Items Updates"
            subtitle={`${disputedUpdates.length} Items Changed — Below are all the items you disputed from the last round with results`}
            items={disputedUpdates}
            tone="bg-indigo-500/10 text-indigo-700 border-indigo-200"
            exposedSectionsKey="disputed"
            exposed={!!exposed["disputed"]}
            onExpose={() => toggleExpose("disputed")}
            expandedItemId={expandedId}
            onToggleExpand={(id) =>
              setExpandedId(expandedId === id ? null : id)
            }
          />

          {/* New Items on Report */}
          <ItemTableSection
            title="New Items on Report"
            subtitle="Below are all the NEW items on the new report to review — automatically marked as negative or positive"
            items={newItems}
            tone="bg-cyan-500/10 text-cyan-700 border-cyan-200"
            showActions
            onToggleDisposition={toggleDisposition}
            exposedSectionsKey="new"
            exposed={!!exposed["new"]}
            onExpose={() => toggleExpose("new")}
            expandedItemId={expandedId}
            onToggleExpand={(id) =>
              setExpandedId(expandedId === id ? null : id)
            }
          />

          {/* Negative Items Not Yet Disputed */}
          <ItemTableSection
            title="Negative Items"
            subtitle="All negative items have been marked — ready for Reasons & Instructions"
            items={negativeUndisputed}
            tone="bg-red-500/10 text-red-700 border-red-200"
            exposedSectionsKey="negative"
            exposed={!!exposed["negative"]}
            onExpose={() => toggleExpose("negative")}
            expandedItemId={expandedId}
            onToggleExpand={(id) =>
              setExpandedId(expandedId === id ? null : id)
            }
          />

          {/* Positive Items */}
          <ItemTableSection
            title="Positive Items"
            subtitle="All positive items have been automatically marked and saved"
            items={positiveItems}
            tone="bg-emerald-500/10 text-emerald-700 border-emerald-200"
            exposedSectionsKey="positive"
            exposed={!!exposed["positive"]}
            onExpose={() => toggleExpose("positive")}
            expandedItemId={expandedId}
            onToggleExpand={(id) =>
              setExpandedId(expandedId === id ? null : id)
            }
          />

          {/* Bottom Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onSave(editedItems)}
                className="bg-gradient-emerald text-white hover:opacity-90"
                size="lg"
              >
                <Save className="mr-2 h-4 w-4" /> Save Changes &amp; Go to
                Dispute Dashboard
              </Button>
              <Button onClick={onDiscardSideBySide} variant="outline" size="lg">
                <Eye className="mr-2 h-4 w-4" /> Discard &amp; View Side-by-Side
              </Button>
              <Button onClick={onDiscardReimport} variant="outline" size="lg">
                <RotateCcw className="mr-2 h-4 w-4" /> Discard &amp; Start Over
                / Re-Import Again
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Manual corrections made here are saved before proceeding to
              disputes.
            </p>
          </div>
        </div>

        {/* Right Sidebar */}
        <ReImportSidebar />
      </div>
    </div>
  );
};

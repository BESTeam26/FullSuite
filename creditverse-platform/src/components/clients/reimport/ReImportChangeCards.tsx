function ChangeCard({
  label,
  thisRound,
  lastRound,
  grandTotal,
  tone,
}: {
  label: string;
  thisRound: number;
  lastRound: number;
  grandTotal: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-2xl font-black ${tone}`}>
          {thisRound}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">{label}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              This Round{" "}
              <span className="ml-auto font-medium">{thisRound}</span>
            </span>
            <span>
              Last Round{" "}
              <span className="ml-auto font-medium">{lastRound}</span>
            </span>
          </div>
          <p className="mt-1 text-xs font-medium">Grand Total {grandTotal}</p>
        </div>
      </div>
    </div>
  );
}

interface ChangeSummary {
  deleted: number;
  onGoing: number;
  undisputedNegative: number;
  updatedToPositive: number;
  newItemsAdded: number;
}

/**
 * Illustration only — labelled as such in the interface below, because a
 * figure a client might read must never be sample data presented as theirs
 * (rule 12). Real counts come from `ReportChangesPanel`, which reads the
 * comparison and the reviewed outcomes.
 */
const sampleChanges: ChangeSummary = {
  deleted: 5,
  onGoing: 32,
  undisputedNegative: 19,
  updatedToPositive: 4,
  newItemsAdded: 4,
};

export function ChangeSummarySection() {
  const c = sampleChanges;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">
          Changes Since Your Last Credit Import
        </p>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
          Sample data
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ChangeCard
          label="No Longer Observed"
          thisRound={c.deleted}
          lastRound={1}
          grandTotal={c.deleted + 1}
          tone="text-status-info"
        />
        <ChangeCard
          label="Disputes On-Going"
          thisRound={c.onGoing}
          lastRound={24}
          grandTotal={c.onGoing + 24}
          tone="text-orange-600"
        />
        <ChangeCard
          label="Un-Disputed Negative"
          thisRound={c.undisputedNegative}
          lastRound={24}
          grandTotal={c.undisputedNegative + 24}
          tone="text-status-danger"
        />
        <ChangeCard
          label="Now Reporting Positive"
          thisRound={c.updatedToPositive}
          lastRound={0}
          grandTotal={c.updatedToPositive}
          tone="text-status-success"
        />
        <ChangeCard
          label="New Items Added"
          thisRound={c.newItemsAdded}
          lastRound={2}
          grandTotal={c.newItemsAdded + 2}
          tone="text-status-info"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">4 New Personal Info</p>
          <p className="text-xs text-muted-foreground">
            0 New Credit Inquiries
          </p>
        </div>
      </div>
    </div>
  );
}

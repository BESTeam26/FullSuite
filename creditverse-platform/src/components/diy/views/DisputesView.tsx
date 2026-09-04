import { GitFork } from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import { DISPOSITION_SECTIONS } from "@/lib/credit-classification";
import { ItemRow } from "./shared";

export const DisputesView = () => {
  const { items, setView } = useDiy();
  const groups = DISPOSITION_SECTIONS.map((s) => ({
    ...s,
    list: items.filter((i) => i.disposition === s.key),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My items</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-classified by factual type. Review each category before disputing.
        </p>
      </div>

      {groups.map((g) => (
        <div
          key={g.key}
          className="rounded-2xl border border-border bg-card p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className={`text-sm font-bold ${g.tone}`}>{g.label}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
              {g.list.length}
            </span>
          </div>
          {g.list.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No items in this category.
            </p>
          ) : (
            <div className="space-y-2">
              {g.list.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        onClick={() => setView("rounds")}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-emerald px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
      >
        <GitFork className="h-4 w-4" /> Open the round & escalation tracker
      </button>
    </div>
  );
};

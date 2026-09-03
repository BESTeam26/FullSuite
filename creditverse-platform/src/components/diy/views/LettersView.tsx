import { useState } from "react";
import { Send, AlertTriangle } from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import { Button } from "@/components/ui/button";
import { evidenceTypes } from "./shared";

export const LettersView = () => {
  const { items, drafts, setDraft, setView } = useDiy();
  const disputed = items.filter((i) => i.disposition === "dispute");
  const [active, setActive] = useState(disputed[0]?.id ?? "");

  const item = items.find((i) => i.id === active);
  const draft = drafts[active];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My letters</h1>
        <p className="mt-1 text-sm text-slate-400">
          You write the facts. AI helps structure, but you approve every word
          before anything is sent.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {disputed.map((it) => (
            <button
              key={it.id}
              onClick={() => setActive(it.id)}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                active === it.id
                  ? "border-emerald-400/40 bg-emerald-500/10 text-white"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {it.name}
            </button>
          ))}
        </div>

        {item && draft ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold">{item.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {item.category} · {item.bureaus.join(" / ")}
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-300">
                What do you believe is inaccurate? (in your own words)
              </label>
              <textarea
                value={draft.reason}
                onChange={(e) => setDraft(active, { reason: e.target.value })}
                placeholder="e.g. The balance shows $4,820 but I settled this account on March 12, 2025 for $0."
                className="mt-1.5 min-h-24 w-full rounded-lg border border-white/10 bg-navy-deep/60 p-3 text-sm text-white placeholder:text-slate-500 focus-visible:border-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-300">
                Send to
              </label>
              <div className="mt-1.5 flex gap-2">
                {(["CRA", "Furnisher"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setDraft(active, { recipient: r })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      draft.recipient === r
                        ? "bg-gradient-emerald text-white"
                        : "border border-white/10 bg-white/5 text-slate-300"
                    }`}
                  >
                    {r === "CRA" ? "Credit Bureau" : "Furnisher (direct)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-300">
                Evidence attached
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {evidenceTypes.slice(0, 5).map((e) => (
                  <button
                    key={e}
                    onClick={() =>
                      setDraft(active, {
                        evidence: draft.evidence.includes(e)
                          ? draft.evidence.filter((x) => x !== e)
                          : [...draft.evidence, e],
                      })
                    }
                    className={`rounded-lg px-2.5 py-1 text-[11px] ${
                      draft.evidence.includes(e)
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-white/10 bg-navy-deep/60 p-3">
              <input
                type="checkbox"
                checked={draft.attested}
                onChange={(e) =>
                  setDraft(active, { attested: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span className="text-[11px] leading-relaxed text-slate-300">
                I confirm this explanation is true to the best of my knowledge.
                This is my dispute, in my own words.
              </span>
            </label>

            <div className="mt-4 flex gap-2">
              <Button
                disabled={!draft.attested || !draft.reason}
                onClick={() => {
                  setDraft(active, { status: "ready" });
                  setView("mail");
                }}
                className="bg-gradient-emerald text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> Approve & prepare to mail
              </Button>
            </div>

            <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-200">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              For direct furnisher disputes, using your own words (not a
              credit-repair template) matters legally. Reg V allows a furnisher
              to decline a dispute it reasonably believes was prepared by a
              credit repair organization.
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-500">
            Select an item to draft your letter.
          </div>
        )}
      </div>
    </div>
  );
};

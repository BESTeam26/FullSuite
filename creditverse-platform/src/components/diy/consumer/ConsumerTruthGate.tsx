import { useState } from "react";
import { ShieldCheck, AlertTriangle, Lock } from "lucide-react";
import {
  isTruthGateComplete,
  type TruthGateAnswer,
} from "@/lib/diy/diy-domain";
import { Button } from "@/components/ui/button";

export const ConsumerTruthGate = () => {
  const [answer, setAnswer] = useState<TruthGateAnswer>({
    recognizesAccount: "yes",
    attested: false,
  });
  const [saved, setSaved] = useState(false);

  const complete = isTruthGateComplete(answer);

  const save = () => {
    if (!complete) return;
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Confirm the facts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Before preparing any dispute, you must confirm the facts in your own
          words. This is your dispute — not a template.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">
          Portfolio Recovery · ****9442
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reported balance: $1,284 · Bureau: Experian
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
        <div>
          <p className="text-sm font-medium text-foreground">
            Do you recognize this account?
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["yes", "no", "unsure"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setAnswer({ ...answer, recognizesAccount: v })}
                className={`rounded-xl border px-3 py-2.5 text-xs font-semibold capitalize transition-colors ${
                  answer.recognizesAccount === v
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {answer.recognizesAccount === "yes" && (
          <>
            <div>
              <label className="text-sm font-medium text-foreground">
                What specifically do you believe is inaccurate?
              </label>
              <textarea
                value={answer.whatIsInaccurate || ""}
                onChange={(e) =>
                  setAnswer({ ...answer, whatIsInaccurate: e.target.value })
                }
                placeholder="The balance should be $0 because I settled this account on March 12, 2025."
                className="mt-2 min-h-[80px] w-full rounded-lg border border-border bg-navy-deep/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Why do you believe it's inaccurate?
              </label>
              <textarea
                value={answer.whyInaccurate || ""}
                onChange={(e) =>
                  setAnswer({ ...answer, whyInaccurate: e.target.value })
                }
                placeholder="I have the settlement agreement and bank payment confirmation."
                className="mt-2 min-h-[80px] w-full rounded-lg border border-border bg-navy-deep/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </>
        )}

        {(answer.recognizesAccount === "no" ||
          answer.recognizesAccount === "unsure") && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-4">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              If you don't recognize this account, it may be identity theft.
              Identity theft has a separate, documented process — we never infer
              it. You'll be routed to the identity-theft workflow with required
              documentation.
            </p>
          </div>
        )}

        <div>
          <label className="flex items-start gap-3 rounded-xl border border-border bg-navy-deep/60 p-4">
            <input
              type="checkbox"
              checked={answer.attested}
              onChange={(e) =>
                setAnswer({ ...answer, attested: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 accent-emerald-500"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              I confirm that the information I provided is true to the best of
              my knowledge. I understand this is my dispute, prepared in my own
              words, and I am responsible for its accuracy.
            </span>
          </label>
        </div>

        <Button
          onClick={save}
          disabled={!complete}
          className="w-full bg-gradient-green text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShieldCheck className="h-4 w-4" />
          {saved ? "Facts confirmed" : "Confirm facts"}
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-[11px] leading-relaxed text-amber-200">
          AI may draft language to help you, but AI does not determine legal
          facts. You review, confirm, and approve before anything is sent.
        </p>
      </div>
    </div>
  );
};

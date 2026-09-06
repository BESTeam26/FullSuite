import { Sparkles, ChevronRight } from "lucide-react";
import { useCopilot } from "@/lib/copilot-context";

interface AICopilotCardProps {
  title?: string;
  message: string;
  prompts?: string[];
  citations?: string[];
}

/**
 * Inline AI guidance inside a workbench.
 *
 * Previously `bg-gradient-navy` with `text-white`. That gradient was never
 * defined anywhere, so the card had NO background: white text on the light
 * workspace, which is to say nothing at all. The same thing had already
 * happened once with `bg-gradient-emerald` — there is a note about it in
 * index.css — which is why there is now a test asserting every
 * `bg-gradient-*` used in the app actually exists.
 *
 * Rebuilt on semantic tokens instead of hardcoded colours. It cannot go
 * invisible again, because it never states a foreground without stating the
 * surface underneath it (rule 15).
 */
export const AICopilotCard = ({
  title = "AI legal guidance",
  message,
  prompts = [],
  citations = [],
}: AICopilotCardProps) => {
  const { openWithTopic } = useCopilot();
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{message}</p>
      {citations.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {citations.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-foreground"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      {prompts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => openWithTopic(p)}
              className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {p} <ChevronRight className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

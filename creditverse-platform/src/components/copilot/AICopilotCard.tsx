import { Sparkles, ChevronRight } from "lucide-react";
import { useCopilot } from "@/lib/copilot-context";

interface AICopilotCardProps {
  title?: string;
  message: string;
  prompts?: string[];
  citations?: string[];
}

/** Inline AI-guidance surface used inside workbenches (Inspector, Items, Metro2). */
export const AICopilotCard = ({
  title = "AI legal guidance",
  message,
  prompts = [],
  citations = [],
}: AICopilotCardProps) => {
  const { openWithTopic } = useCopilot();
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-navy p-5 text-white">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
          <Sparkles className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{message}</p>
      {citations.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {citations.map((c) => (
            <span
              key={c}
              className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-300"
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
              onClick={() => openWithTopic(p)}
              className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
            >
              {p} <ChevronRight className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

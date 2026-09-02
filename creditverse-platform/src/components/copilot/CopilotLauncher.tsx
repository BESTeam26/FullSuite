import { Sparkles } from "lucide-react";
import { useCopilot } from "@/lib/copilot-context";

export const CopilotLauncher = () => {
  const { setOpen } = useCopilot();
  return (
    <button
      onClick={() => setOpen(true)}
      className="group relative flex items-center gap-2 rounded-full bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.03]"
    >
      <Sparkles className="h-4 w-4 text-emerald-200" />
      <span className="hidden sm:inline">Ask Lina</span>
      <span className="absolute -right-1 -top-1 flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
      </span>
    </button>
  );
};

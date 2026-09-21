/**
 * "A new version is ready" — one line, one button, never a forced reload.
 *
 * A reload while somebody is mid-sentence in a message or mid-edit on a
 * client file would lose their work, so the app asks rather than acts.
 */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { watchForNewVersion } from "@/lib/app-version";

export function NewVersionBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => watchForNewVersion(() => setStale(true)), []);
  if (!stale) return null;

  return (
    <div role="status"
      className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-3 border-t border-primary/30 bg-primary/10 px-4 py-2 text-xs backdrop-blur">
      <span className="font-semibold text-foreground">A newer version of FullSuite is ready.</span>
      <span className="text-muted-foreground">This tab is still running an older one.</span>
      <button type="button" onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reload
      </button>
      <button type="button" onClick={() => setStale(false)}
        className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Not now
      </button>
    </div>
  );
}

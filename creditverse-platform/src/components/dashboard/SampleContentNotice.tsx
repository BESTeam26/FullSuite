/**
 * Says plainly that a screen shows sample content — bundled illustrations, not
 * this organization's records (rule 12). Used by surfaces whose live data
 * model does not exist yet, so nobody mistakes an example for a fact.
 */
import { Info } from "lucide-react";

export function SampleContentNotice({ what }: { what: string }) {
  return (
    <div role="note" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <p><span className="font-bold">Sample content.</span> {what} Nothing on this screen comes from your organization's records yet.</p>
    </div>
  );
}

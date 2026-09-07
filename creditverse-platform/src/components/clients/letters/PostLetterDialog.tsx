/**
 * Post one approved letter through Lob.
 *
 * This is the one control in the platform that spends money and puts paper in
 * the post, so it is deliberately not a one-click button. The addresses are
 * shown and editable before sending, the cost basis is stated, and a live
 * posting says so in a way that cannot be mistaken for a simulation.
 *
 * Nothing here talks to Lob. The Edge Function does, after the database has
 * checked this person's own permission and the approval gate.
 */
import { useState } from "react";
import { Loader2, Mail, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/data/error-message";
import { postLetter, type PostalAddress, type PostLetterResult } from "@/lib/data/letter-mailing";
import { getActiveCRAAddress } from "@/lib/dispute/cra-addresses-and-workflows";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

const EMPTY: PostalAddress = { name: "", line1: "", line2: "", city: "", state: "", zip: "" };

/** Split "Atlanta, GA 30374-0256" back into its parts for the form. */
function splitCityStateZip(value: string): { city: string; state: string; zip: string } {
  const m = value.match(/^(.*?),\s*([A-Za-z]{2})\s+([\d-]+)$/);
  if (!m) return { city: value, state: "", zip: "" };
  return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3].trim() };
}

function AddressFields({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: PostalAddress;
  onChange: (next: PostalAddress) => void;
}) {
  const set = (k: keyof PostalAddress, v: string) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelCls}>Name</span>
          <input className={inputCls} value={value.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelCls}>Street</span>
          <input className={inputCls} value={value.line1} onChange={(e) => set("line1", e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelCls}>Line 2</span>
          <input className={inputCls} value={value.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
        </label>
        <label className="block">
          <span className={labelCls}>City</span>
          <input className={inputCls} value={value.city} onChange={(e) => set("city", e.target.value)} />
        </label>
        <label className="block">
          <span className={labelCls}>State</span>
          <input className={inputCls} maxLength={2} value={value.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />
        </label>
        <label className="block">
          <span className={labelCls}>ZIP</span>
          <input className={inputCls} maxLength={10} value={value.zip} onChange={(e) => set("zip", e.target.value)} />
        </label>
      </div>
    </fieldset>
  );
}

export function PostLetterDialog({
  open,
  onOpenChange,
  letterId,
  bureau,
  recipientName,
  body,
  sender,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterId: string;
  bureau: string | null;
  recipientName: string;
  body: string;
  /** The consumer's own address — a dispute letter is from them, not from BES. */
  sender: PostalAddress;
  onPosted: () => void;
}) {
  const registry = bureau ? getActiveCRAAddress(bureau) : null;
  const [to, setTo] = useState<PostalAddress>(() =>
    registry
      ? { name: registry.addressee, line1: registry.street, line2: "", ...splitCityStateZip(registry.cityStateZip) }
      : { ...EMPTY, name: recipientName },
  );
  const [from, setFrom] = useState<PostalAddress>(sender);
  const [certified, setCertified] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostLetterResult | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await postLetter({ letterId, to, from, body, certified });
      setResult(r);
      onPosted();
    } catch (e) {
      setError(errorMessage(e, "The letter was not posted."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Post this letter
          </DialogTitle>
          <DialogDescription>
            Lob prints and posts it. Check both addresses — they are copied onto the mailing record
            exactly as they are here, so a correction later cannot change where it went.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div
              className={`rounded-lg border p-3 text-sm ${
                result.posted
                  ? "border-emerald-600/30 bg-emerald-500/10 text-status-success"
                  : "border-amber-600/30 bg-amber-500/10 text-status-warning"
              }`}
            >
              {result.posted ? (
                <>
                  <p className="font-semibold">Posted.</p>
                  <p className="mt-1 text-xs">
                    Lob accepted it{result.providerId ? ` as ${result.providerId}` : ""}
                    {result.expectedDelivery ? `, expected delivery ${result.expectedDelivery}` : ""}
                    {result.costCents !== null ? `, cost $${(result.costCents / 100).toFixed(2)}` : ""}. The
                    statutory clocks have started.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Simulated, not posted.</p>
                  <p className="mt-1 text-xs">
                    Your Lob key is a TEST key, so no paper was printed and nothing was charged. The letter
                    stays approved and the statutory clocks have deliberately not started — they must not
                    run on an envelope that does not exist.
                  </p>
                </>
              )}
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <AddressFields legend="To" value={to} onChange={setTo} />
            <AddressFields legend="From — the consumer" value={from} onChange={setFrom} />

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={certified}
                onChange={(e) => setCertified(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Send certified — costs more, and gives proof of delivery
            </label>

            {!registry && bureau && (
              <p className="flex items-start gap-1.5 text-xs text-status-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No stored address for {bureau}. Type it in and check it against the bureau's current
                dispute page.
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-status-danger">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void send()} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                Post it
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

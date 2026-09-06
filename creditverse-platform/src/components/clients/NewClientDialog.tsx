/**
 * New CreditOps client for the active organization — name, email, phone. The
 * record starts at Onboarding · Pre-Round as a SaaS-pulled client of this
 * organization; `createFulfillmentClient` and the insert policy decide who may
 * (organization admins and BES in scope). Opens from the top bar's New Client.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { createFulfillmentClient } from "@/lib/data/fulfillment-clients";
import { requireSupabase } from "@/lib/supabase/client";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function NewClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const auth = useAuth();
  const { activeOrganization } = useAgency();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganization || !auth.user) return;
    if (!f.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setError("A name and a valid email are required."); return; }
    setBusy(true); setError(null);
    try {
      const org = await requireSupabase().from("organizations").select("agency_id").eq("id", activeOrganization.id).single();
      if (org.error) throw org.error;
      const id = await createFulfillmentClient({ agencyId: org.data.agency_id, name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim() || undefined, mode: "saas_pulled", organizationId: activeOrganization.id, autoSync: true, status: "Onboarding", round: "Pre-Round" });
      void qc.invalidateQueries({ queryKey: ["fulfillment-clients"] }); void qc.invalidateQueries({ queryKey: ["creditops"] });
      onOpenChange(false); setF({ name: "", email: "", phone: "" });
      navigate(`/app/creditops/cases/${id}`);
    } catch (err) { setError(errorMessage(err, "Could not create the client.")); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> New client</DialogTitle>
          <DialogDescription>Adds a CreditOps client to {activeOrganization?.name ?? "this organization"}, starting at Onboarding. You can import their credit report from the profile.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          <label className="block"><span className={labelCls}>Full name</span><input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} className={inputCls} required autoFocus /></label>
          <label className="block"><span className={labelCls}>Email</span><input type="email" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} className={inputCls} required /></label>
          <label className="block"><span className={labelCls}>Phone (optional)</span><input value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} className={inputCls} /></label>
          {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !activeOrganization}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />} Create client</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

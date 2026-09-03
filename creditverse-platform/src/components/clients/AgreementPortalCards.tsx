import { useState } from "react";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  FileText,
  AlertCircle,
  CheckCircle2,
  Globe,
  Mail,
  MessageSquare,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { useAgreements } from "@/lib/agreements-context";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

export const AgreementCard = () => {
  const { agreements } = useAgreements();
  const [selectedAgreement, setSelectedAgreement] = useState("agr-standard");
  const activeAgreements = agreements.filter((a) => a.status === "active");
  const agr = agreements.find((a) => a.id === selectedAgreement);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-600" />
          <h2 className="font-semibold">Agreement &amp; pricing</h2>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
          Billing eligibility: cleared
        </span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">
            Assigned agreement
          </Label>
          <OpsSelect
            value={selectedAgreement}
            onValueChange={setSelectedAgreement}
            options={activeAgreements.map((a) => ({
              value: a.id,
              label: `${a.name} (${a.version})`,
            }))}
            size="field"
            aria-label="Agreement"
            className="mt-1 text-sm font-medium"
          />
          {agr && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              {agr.hasCroaDisclosures ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              ) : (
                <AlertCircle className="h-3 w-3 text-amber-600" />
              )}
              {agr.hasCroaDisclosures
                ? "CROA disclosures included"
                : "Missing CROA disclosures"}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First amount" value={agr?.firstAmount || "—"} />
          <Field label="Monthly amount" value={agr?.monthlyAmount || "—"} />
          <Field label="Couples first" value={agr?.couplesFirst || "—"} />
          <Field label="Couples monthly" value={agr?.couplesMonthly || "—"} />
        </div>
      </div>
    </div>
  );
};

export const PortalCard = () => {
  const [portalActive, setPortalActive] = useState(true);
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-emerald-600" />
          <h2 className="font-semibold">Portal &amp; communication</h2>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Client portal
          </span>
          <button
            onClick={() => setPortalActive((s) => !s)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              portalActive ? "bg-emerald-500" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                portalActive ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600">
          <Mail className="h-3.5 w-3.5" /> Email opt-in
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600">
          <MessageSquare className="h-3.5 w-3.5" /> SMS opt-in
        </span>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            portalActive
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {portalActive ? "Portal active" : "Portal disabled"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Preferred language" value="English" />
        <Field label="Last active on portal" value="Aug 24, 6:32 PM" />
      </div>
    </div>
  );
};

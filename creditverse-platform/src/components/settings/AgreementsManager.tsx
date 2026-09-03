import { useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Scale,
  X,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAgreements, type Agreement } from "@/lib/agreements-context";
import { OpsSelect } from "@/components/ui/ops-select";

const CROA_DISCLOSURE_TEMPLATE = `CROA MANDATED DISCLOSURES (15 U.S.C. §1679)

1. You have the right to dispute inaccurate or incomplete information in your credit file directly with the consumer reporting agency or the furnisher.

2. You may dispute inaccurate or incomplete information on your own without cost by contacting the credit bureau directly.

3. A consumer reporting agency may not charge for blocking or removing information that results from identity theft.

4. You have the right to obtain a free copy of your credit report from each nationwide consumer reporting agency once every 12 months at annualcreditreport.com.

5. No advance payment: You will not be charged for any service until that service has been fully performed.

6. Cancellation: You may cancel this Agreement within three (3) business days of signing without penalty.

7. No guarantees: Accurate, verifiable, and timely information may not be removed. We do not guarantee deletion of any item or any score increase.`;

export const AgreementsManager = () => {
  const { agreements, addAgreement, updateAgreement, removeAgreement } =
    useAgreements();
  const [editing, setEditing] = useState<Agreement | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "Standard" as Agreement["type"],
    body: "",
    hasCroaDisclosures: true,
    firstAmount: "",
    monthlyAmount: "",
    couplesFirst: "",
    couplesMonthly: "",
  });

  const openNew = () => {
    setForm({
      name: "",
      type: "Standard",
      body: CROA_DISCLOSURE_TEMPLATE,
      hasCroaDisclosures: true,
      firstAmount: "",
      monthlyAmount: "",
      couplesFirst: "",
      couplesMonthly: "",
    });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (a: Agreement) => {
    setForm({
      name: a.name,
      type: a.type,
      body: a.body,
      hasCroaDisclosures: a.hasCroaDisclosures,
      firstAmount: a.firstAmount ?? "",
      monthlyAmount: a.monthlyAmount ?? "",
      couplesFirst: a.couplesFirst ?? "",
      couplesMonthly: a.couplesMonthly ?? "",
    });
    setEditing(a);
    setShowForm(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) {
      updateAgreement(editing.id, {
        ...form,
        version: `v${parseFloat(editing.version.slice(1)) + 0.1}`,
        updatedAt: new Date().toLocaleDateString(),
      });
    } else {
      addAgreement({
        ...form,
        status: "active",
        version: "v1.0",
        updatedAt: new Date().toLocaleDateString(),
      });
    }
    setShowForm(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-status-success" />
          <h2 className="font-semibold">Agreements &amp; CROA disclosures</h2>
        </div>
        <Button
          size="sm"
          className="bg-gradient-emerald text-white"
          onClick={openNew}
        >
          <Plus className="h-3.5 w-3.5" /> New agreement
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Create and manage client agreements with CROA-mandated disclosures.
        Assigned per client on their account. CDM-style contract management.
      </p>

      <div className="mt-4 space-y-2">
        {agreements.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4"
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  a.hasCroaDisclosures
                    ? "bg-emerald-500/10 text-status-success"
                    : "bg-amber-500/10 text-status-warning"
                }`}
              >
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{a.name}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {a.type}
                  </Badge>
                  <Badge
                    className={
                      a.status === "active"
                        ? "bg-emerald-500/10 text-status-success"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {a.status}
                  </Badge>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {a.version} · Updated {a.updatedAt}
                  {a.hasCroaDisclosures ? (
                    <span className="flex items-center gap-0.5 text-status-success">
                      <CheckCircle2 className="h-3 w-3" /> CROA disclosures
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-status-warning">
                      <AlertCircle className="h-3 w-3" /> Missing CROA
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeAgreement(a.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-status-danger" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Editor modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5">
              <h3 className="font-semibold">
                {editing ? "Edit agreement" : "New agreement"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Agreement name
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Standard Credit Services Agreement"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <OpsSelect
                    value={form.type}
                    onValueChange={(v) =>
                      setForm({ ...form, type: v as Agreement["type"] })
                    }
                    options={["Standard", "Couples", "DIY", "Custom"]}
                    size="field"
                    aria-label="Agreement type"
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.hasCroaDisclosures}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hasCroaDisclosures: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-emerald-500"
                />
                Include CROA-mandated disclosures
              </label>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Pricing (leave blank for manual entry on client)
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      First amount
                    </Label>
                    <Input
                      value={form.firstAmount}
                      onChange={(e) =>
                        setForm({ ...form, firstAmount: e.target.value })
                      }
                      placeholder="Blank = manual"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Monthly amount
                    </Label>
                    <Input
                      value={form.monthlyAmount}
                      onChange={(e) =>
                        setForm({ ...form, monthlyAmount: e.target.value })
                      }
                      placeholder="Blank = manual"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Couples first
                    </Label>
                    <Input
                      value={form.couplesFirst}
                      onChange={(e) =>
                        setForm({ ...form, couplesFirst: e.target.value })
                      }
                      placeholder="Blank = manual"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Couples monthly
                    </Label>
                    <Input
                      value={form.couplesMonthly}
                      onChange={(e) =>
                        setForm({ ...form, couplesMonthly: e.target.value })
                      }
                      placeholder="Blank = manual"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Agreement body
                </Label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={16}
                  className="mt-1 w-full rounded-xl border border-border bg-muted/20 p-4 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-5">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button className="bg-gradient-emerald text-white" onClick={save}>
                <Save className="h-3.5 w-3.5" /> Save agreement
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

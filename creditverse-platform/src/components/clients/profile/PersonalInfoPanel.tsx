import { useState } from "react";
import { Loader2, Pencil, Save, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { useUpdateClientIdentity } from "@/lib/data/use-clients";
import type { ClientProfile } from "@/lib/data/clients";

const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";

const Field = ({ label, value }: { label: string; value: string | null }) => (
  <div>
    <p className={labelCls}>{label}</p>
    <p className="text-sm text-foreground">{value?.trim() || <span className="text-muted-foreground">—</span>}</p>
  </div>
);

/**
 * Identity, edited in one place for every service.
 *
 * The save is a plain update on `clients`; `client_writable()` decides who may,
 * and either engine's edit key qualifies — so a FundingOps-only organization
 * can still fix a borrower's phone number without holding a CreditOps
 * permission it was never sold. A user without either key gets a refusal from
 * the database, which is what the error line shows.
 */
export const PersonalInfoPanel = ({ client }: { client: ClientProfile }) => {
  const update = useUpdateClientIdentity(client.id);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: client.firstName ?? "",
    lastName: client.lastName,
    preferredName: client.preferredName ?? "",
    email: client.email,
    phone: client.phone ?? "",
    dateOfBirth: client.dateOfBirth ?? "",
    addressLine1: client.address.line1 ?? "",
    addressLine2: client.address.line2 ?? "",
    city: client.address.city ?? "",
    state: client.address.state ?? "",
    postalCode: client.address.postalCode ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lastName.trim()) {
      setError("A last name is required — it is what a letter to a bureau has to carry.");
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim(),
        preferredName: form.preferredName.trim() || null,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: form.addressLine2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        postalCode: form.postalCode.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "Could not save these details."));
    }
  };

  if (!editing) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UserRound className="h-4 w-4 text-primary" /> Personal information
          </h2>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name" value={client.firstName} />
          <Field label="Last name" value={client.lastName} />
          <Field label="Goes by" value={client.preferredName} />
          <Field label="Email" value={client.email} />
          <Field label="Phone" value={client.phone} />
          <Field label="Date of birth" value={client.dateOfBirth ? formatDate(client.dateOfBirth) : null} />
          <Field label="Address" value={client.address.line1} />
          <Field label="Address line 2" value={client.address.line2} />
          <Field
            label="City / State / ZIP"
            value={[client.address.city, client.address.state, client.address.postalCode].filter(Boolean).join(" ") || null}
          />
        </div>
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Editing here changes the person for every service at once — that is the point of one client
          record. Record source: {client.provenance.replace(/_/g, " ")}. Last updated{" "}
          {formatDate(client.updatedAt)}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UserRound className="h-4 w-4 text-primary" /> Editing personal information
        </h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(false); setError(null); }}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button type="submit" size="sm" disabled={update.isPending}>
            {update.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block"><span className={labelCls}>First name</span><input className={inputCls} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></label>
        <label className="block"><span className={labelCls}>Last name</span><input className={inputCls} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required /></label>
        <label className="block"><span className={labelCls}>Goes by</span><input className={inputCls} value={form.preferredName} onChange={(e) => set("preferredName", e.target.value)} /></label>
        <label className="block"><span className={labelCls}>Email</span><input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} required /></label>
        <label className="block"><span className={labelCls}>Phone</span><input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="block"><span className={labelCls}>Date of birth</span><input type="date" className={inputCls} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className={labelCls}>Address</span><input className={inputCls} value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} /></label>
        <label className="block"><span className={labelCls}>Address line 2</span><input className={inputCls} value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} /></label>
        <label className="block"><span className={labelCls}>City</span><input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} /></label>
        <label className="block"><span className={labelCls}>State</span><input className={inputCls} maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value)} /></label>
        <label className="block"><span className={labelCls}>ZIP</span><input className={inputCls} maxLength={12} value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-status-danger">{error}</p>}
    </form>
  );
};

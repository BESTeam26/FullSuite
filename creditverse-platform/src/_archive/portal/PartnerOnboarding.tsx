/* ARCHIVED 2026-09-12 — the portal no longer asks a partner to onboard.
 *
 * Dee: "I don't want this onboarding form upon portal access… this onboarding
 * has been done prior during their onboarding." BES onboards a partner before
 * the portal exists for them, so a guided first-time flow inside the portal
 * was asking for details somebody had already given a person.
 *
 * The FIELDS are not lost: `PartnerInformation` carries the same ones and is
 * live under Account settings, where a partner goes to change something.
 * Parked here rather than deleted because Dee asked for the forms to be kept,
 * and nothing in the bundle imports this file.
 */
/**
 * BES CreditOps Partner Onboarding — the first entry into the Partner Profile.
 *
 * Nothing here is an intake copy. Company information lands on the partner
 * record, the primary contact on the contact's own row, and every system on
 * the credential vault (0225): the password into Supabase Vault, the rest in
 * the open, categorised so the team finds "the CRM" and "the domain" without
 * reading labels. The partner edits all of it later from Partner Information.
 *
 * Passwords typed here never touch a profile field. They go straight to
 * `my_partner_credential_save`, which hands them to the vault.
 *
 * "Continue to Agreement": when BES has flagged an onboarding agreement
 * template, completing the form creates the signature request for THIS
 * contact and opens the signing page. When none is flagged, onboarding is
 * complete and BES sends the agreement itself.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OpsSelect } from "@/components/ui/ops-select";
import { completeMyPartnerOnboarding, saveMyPartnerProfile, type AgencyPartner } from "@/lib/data/agency-partners";
import { saveMyPartnerCredential, type CredentialPlatform } from "@/lib/data/partner-credentials";
import { useCredentialPlatforms, myCredentialsKey } from "@/lib/data/use-partner-credentials";
import { CREDENTIAL_CATEGORIES, type CredentialCategory } from "@/lib/partners/credential-domain";
import { useToast } from "@/hooks/use-toast";

const NONE = "__none";

/** One system's fields as typed. Empty entries are simply not saved. */
interface SystemDraft {
  platformKey: string;
  providerName: string;
  accountName: string;
  accountType: string;
  url: string;
  username: string;
  secret: string;
  affiliateLink: string;
  dashboardUrl: string;
  notes: string;
}
const blankSystem = (platformKey = NONE): SystemDraft => ({
  platformKey, providerName: "", accountName: "", accountType: "not_sure", url: "", username: "", secret: "",
  affiliateLink: "", dashboardUrl: "", notes: "",
});
const filled = (d: SystemDraft) =>
  d.platformKey !== NONE && (d.username.trim() || d.secret || d.url.trim() || d.affiliateLink.trim() || d.accountName.trim() || d.providerName.trim());

const Field = ({ id, label, required, children }: { id?: string; label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id} className="text-xs">{label}{required && <span className="text-status-danger"> *</span>}</Label>
    {children}
  </div>
);

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-border bg-card p-4">
    <h2 className="text-sm font-bold text-foreground">{title}</h2>
    {hint && <p className="mb-3 text-xs text-muted-foreground">{hint}</p>}
    <div className="mt-2 grid gap-3">{children}</div>
  </section>
);

export function PartnerOnboarding({ partner, contactName, contactEmail }: {
  partner: AgencyPartner; contactName: string | null; contactEmail: string | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const platforms = useCredentialPlatforms();
  const forCategory = (cat: CredentialCategory): CredentialPlatform[] =>
    (platforms.data ?? []).filter((p) => p.category === cat || p.key === "other" || (cat === "esp" && p.key === "gohighlevel"));

  const [firstName, lastName] = (() => {
    const parts = (contactName ?? "").trim().split(/\s+/);
    return [parts[0] ?? "", parts.slice(1).join(" ")];
  })();
  const [company, setCompany] = useState({
    legal: partner.legalBusinessName ?? partner.name ?? "", dba: partner.dbaName ?? "",
    street: partner.addressStreet ?? "", city: partner.addressCity ?? "", state: partner.addressState ?? "", zip: partner.addressZip ?? "",
    website: partner.website ?? "", phone: partner.phone ?? "", email: partner.contactEmail ?? "",
  });
  const [contact, setContact] = useState({ first: firstName, last: lastName, title: "", email: contactEmail ?? "", mobile: "" });
  const [crm, setCrm] = useState<SystemDraft>(blankSystem());
  const [usesGhl, setUsesGhl] = useState<"yes" | "no" | "">("");
  const [ghl, setGhl] = useState<SystemDraft>(blankSystem("gohighlevel"));
  const [esp, setEsp] = useState<SystemDraft>(blankSystem());
  const [monitoring, setMonitoring] = useState<SystemDraft>(blankSystem());
  const [affiliates, setAffiliates] = useState<SystemDraft[]>([]);
  const [domain, setDomain] = useState<SystemDraft>(blankSystem());
  const [others, setOthers] = useState<SystemDraft[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const required = useMemo(() => {
    const missing: string[] = [];
    if (!company.legal.trim()) missing.push("Legal business name");
    if (!company.street.trim() || !company.city.trim() || !company.state.trim() || !company.zip.trim()) missing.push("Business address");
    if (!contact.first.trim()) missing.push("First name");
    if (!contact.last.trim()) missing.push("Last name");
    if (!contact.title.trim()) missing.push("Title / role");
    if (!contact.mobile.trim()) missing.push("Mobile number");
    if (crm.platformKey === NONE) missing.push("Credit repair CRM");
    if (crm.platformKey === "other" && !crm.providerName.trim()) missing.push("CRM name");
    if (!usesGhl) missing.push("GoHighLevel yes/no");
    if (!confirm) missing.push("Access confirmation");
    return missing;
  }, [company, contact, crm, usesGhl, confirm]);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await saveMyPartnerProfile({
        legalBusinessName: company.legal, dbaName: company.dba,
        addressStreet: company.street, addressCity: company.city, addressState: company.state, addressZip: company.zip,
        website: company.website, phone: company.phone, contactEmail: company.email,
        firstName: contact.first, lastName: contact.last, title: contact.title, mobile: contact.mobile,
      });
      const save = (cat: CredentialCategory, d: SystemDraft, labelHint: string) => {
        const p = (platforms.data ?? []).find((x) => x.key === d.platformKey);
        const provider = d.platformKey === "other" ? d.providerName.trim() || "Other" : p?.label ?? d.platformKey;
        return saveMyPartnerCredential({
          platformKey: d.platformKey, category: cat,
          label: `${provider} ${labelHint}`.trim(),
          providerName: d.platformKey === "other" ? d.providerName.trim() || null : null,
          accountName: d.accountName.trim() || null,
          accountType: cat === "ghl" ? d.accountType || null : null,
          url: d.url.trim() || null, username: d.username.trim() || null,
          secret: d.secret.length > 0 ? d.secret : "",
          affiliateLink: d.affiliateLink.trim() || null, dashboardUrl: d.dashboardUrl.trim() || null,
          notes: d.notes.trim() || null,
        });
      };
      const jobs: Promise<unknown>[] = [];
      if (filled(crm)) jobs.push(save("crm", crm, "login"));
      if (usesGhl === "yes" && filled(ghl)) jobs.push(save("ghl", ghl, "login"));
      if (filled(esp)) jobs.push(save("esp", esp, "login"));
      if (filled(monitoring)) jobs.push(save("credit_monitoring", monitoring, "affiliate"));
      for (const a of affiliates) if (filled(a)) jobs.push(save("affiliate", a, "affiliate"));
      if (filled(domain)) jobs.push(save("domain", domain, "login"));
      for (const o of others) if (filled(o)) jobs.push(save("other", o, "login"));
      await Promise.all(jobs);

      const token = await completeMyPartnerOnboarding(true);
      void qc.invalidateQueries({ queryKey: ["partner", "me"] });
      void qc.invalidateQueries({ queryKey: myCredentialsKey });
      if (token) {
        toast({ title: "Saved to your Partner Profile", description: "One more step: your agreement." });
        navigate(`/sign/${token}`);
      } else {
        toast({ title: "Onboarding complete", description: "Your details are saved. BES will send your agreement." });
      }
    } catch (e) {
      setError((e as Error).message.replace(/^.*?:\s*/, "") || "Something did not save.");
    } finally {
      setSaving(false);
    }
  };

  const SystemFields = ({ d, set, cat, labels }: {
    d: SystemDraft; set: (n: SystemDraft) => void; cat: CredentialCategory;
    labels: { provider: string; url?: string; account?: string; showAccountType?: boolean; affiliate?: boolean };
  }) => (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.provider}>
          <OpsSelect size="field" value={d.platformKey} onValueChange={(v) => set({ ...d, platformKey: v })}
            options={[{ value: NONE, label: "Choose…" }, ...forCategory(cat).map((p) => ({ value: p.key, label: p.label }))]} />
        </Field>
        {d.platformKey === "other" && (
          <Field label="Name of the provider" required>
            <Input value={d.providerName} onChange={(e) => set({ ...d, providerName: e.target.value })} />
          </Field>
        )}
        {labels.account && (
          <Field label={labels.account}>
            <Input value={d.accountName} onChange={(e) => set({ ...d, accountName: e.target.value })} />
          </Field>
        )}
        {labels.showAccountType && (
          <Field label="GoHighLevel account type">
            <OpsSelect size="field" value={d.accountType} onValueChange={(v) => set({ ...d, accountType: v })}
              options={[{ value: "agency", label: "Agency" }, { value: "subaccount", label: "Subaccount" }, { value: "not_sure", label: "Not sure" }]} />
          </Field>
        )}
      </div>
      {labels.affiliate && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Affiliate link"><Input value={d.affiliateLink} onChange={(e) => set({ ...d, affiliateLink: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Affiliate / partner dashboard URL"><Input value={d.dashboardUrl} onChange={(e) => set({ ...d, dashboardUrl: e.target.value })} placeholder="https://…" /></Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={labels.url ?? "Login URL"}><Input value={d.url} onChange={(e) => set({ ...d, url: e.target.value })} placeholder="https://…" autoComplete="off" /></Field>
        <Field label="Login email / username"><Input value={d.username} onChange={(e) => set({ ...d, username: e.target.value })} autoComplete="off" /></Field>
        <Field label="Password / access credential">
          <Input type="password" value={d.secret} onChange={(e) => set({ ...d, secret: e.target.value })} autoComplete="new-password" />
        </Field>
      </div>
    </>
  );

  const RepeatList = ({ items, set, cat, title, addLabel, labels }: {
    items: SystemDraft[]; set: (n: SystemDraft[]) => void; cat: CredentialCategory; title: string; addLabel: string;
    labels: Parameters<typeof SystemFields>[0]["labels"];
  }) => (
    <>
      {items.map((d, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">{title} {i + 1}</p>
            <button type="button" className="text-xs text-destructive hover:underline" onClick={() => set(items.filter((_, j) => j !== i))}>
              <Trash2 className="mr-1 inline h-3 w-3" /> Remove
            </button>
          </div>
          <div className="grid gap-3">
            <SystemFields d={d} set={(n) => set(items.map((x, j) => (j === i ? n : x)))} cat={cat} labels={labels} />
            {cat === "other" && (
              <Field label="Notes"><Input value={d.notes} onChange={(e) => set(items.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))} /></Field>
            )}
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => set([...items, blankSystem()])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {addLabel}
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <h1 className="text-lg font-bold text-foreground">BES CreditOps Partner Onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The information provided here will be saved to your Partner Profile. You can review and update these
          details anytime from your partner portal.
        </p>
      </div>

      <Section title="Company Information">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ob-legal" label="Legal Business Name" required><Input id="ob-legal" value={company.legal} onChange={(e) => setCompany({ ...company, legal: e.target.value })} /></Field>
          <Field id="ob-dba" label="DBA / Brand Name"><Input id="ob-dba" value={company.dba} onChange={(e) => setCompany({ ...company, dba: e.target.value })} /></Field>
        </div>
        <Field id="ob-street" label="Business Address" required>
          <Input id="ob-street" value={company.street} onChange={(e) => setCompany({ ...company, street: e.target.value })} placeholder="Street Address" />
          <div className="grid grid-cols-[1fr_6rem_7rem] gap-1.5">
            <Input value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} placeholder="City" aria-label="City" />
            <Input value={company.state} onChange={(e) => setCompany({ ...company, state: e.target.value })} placeholder="State" aria-label="State" />
            <Input value={company.zip} onChange={(e) => setCompany({ ...company, zip: e.target.value })} placeholder="ZIP Code" aria-label="ZIP Code" />
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="ob-web" label="Business Website"><Input id="ob-web" value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} placeholder="https://" /></Field>
          <Field id="ob-phone" label="Business Phone Number"><Input id="ob-phone" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></Field>
          <Field id="ob-email" label="Main Business Email"><Input id="ob-email" type="email" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Primary Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ob-first" label="First Name" required><Input id="ob-first" value={contact.first} onChange={(e) => setContact({ ...contact, first: e.target.value })} /></Field>
          <Field id="ob-last" label="Last Name" required><Input id="ob-last" value={contact.last} onChange={(e) => setContact({ ...contact, last: e.target.value })} /></Field>
          <Field id="ob-title" label="Title / Role" required><Input id="ob-title" value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} /></Field>
          <Field id="ob-cemail" label="Email Address" required><Input id="ob-cemail" value={contact.email} readOnly className="bg-muted/40" /></Field>
          <Field id="ob-mobile" label="Mobile Number" required><Input id="ob-mobile" value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} /></Field>
        </div>
        <p className="text-[11px] text-muted-foreground">Your email is your sign-in and cannot be changed here. Ask BES if it needs to change.</p>
      </Section>

      <Section title="Credit Repair CRM">
        <SystemFields d={crm} set={setCrm} cat="crm" labels={{ provider: "Which Credit Repair CRM are you currently using? *", url: "Credit Repair CRM Login URL" }} />
      </Section>

      <Section title="GoHighLevel Access">
        <Field label="Do you currently use GoHighLevel?" required>
          <div className="flex gap-1.5" role="group">
            {(["yes", "no"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={usesGhl === v} onClick={() => setUsesGhl(v)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${usesGhl === v ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-muted"}`}>
                {v === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </Field>
        {usesGhl === "yes" && (
          <SystemFields d={ghl} set={setGhl} cat="ghl" labels={{ provider: "Platform", account: "Account / Location Name", showAccountType: true, url: "GoHighLevel Login URL" }} />
        )}
      </Section>

      <Section title="Email / ESP Access">
        <SystemFields d={esp} set={setEsp} cat="esp" labels={{ provider: "Email / ESP Provider" }} />
      </Section>

      <Section title="Credit Monitoring">
        <SystemFields d={monitoring} set={setMonitoring} cat="credit_monitoring" labels={{ provider: "Credit Monitoring Provider", affiliate: true, url: "Affiliate login URL" }} />
      </Section>

      <Section title="Affiliate Accounts" hint="Add any additional affiliate programs BES may need for your account.">
        <RepeatList items={affiliates} set={setAffiliates} cat="affiliate" title="Affiliate account" addLabel="Add an affiliate account"
          labels={{ provider: "Affiliate / Provider", account: "Affiliate / Provider Name", affiliate: true, url: "Dashboard login URL" }} />
      </Section>

      <Section title="Domain Information">
        <SystemFields d={domain} set={setDomain} cat="domain" labels={{ provider: "Domain Provider", account: "Domain Name", url: "Domain Provider Login URL" }} />
      </Section>

      <Section title="Additional Systems" hint="Add any other platform BES needs access to.">
        <RepeatList items={others} set={setOthers} cat="other" title="System" addLabel="Add another system"
          labels={{ provider: "Platform Type", account: "Platform Name" }} />
      </Section>

      <Section title="Access Confirmation">
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>
            I confirm that the information and access credentials provided may be used by Blessed Empire Services for
            authorized services performed for my company.
          </span>
        </label>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Passwords are encrypted on save and every time BES looks at one it is recorded.
        </p>
      </Section>

      {required.length > 0 && (
        <p className="text-xs text-muted-foreground">Still needed: {required.join(", ")}.</p>
      )}
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
      <Button size="lg" disabled={required.length > 0 || saving} onClick={() => void submit()}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue to Agreement
      </Button>
    </div>
  );
}

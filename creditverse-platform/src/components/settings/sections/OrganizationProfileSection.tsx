/**
 * Organization › Profile & branding — the organization's own identity on its
 * portals and letters: logo, primary colour, tagline, custom domain. Saved
 * through `merge_organization_branding` (one JSON merge in SQL, never
 * read-modify-write). Brand customization never makes another agency (rule 16).
 */
import { useEffect, useState } from "react";
import { Loader2, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/shared";
import { useAgency } from "@/lib/agency-context";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function OrganizationProfileSection({ canEdit }: { canEdit: boolean }) {
  const agency = useAgency();
  const org = agency.activeOrganization;
  const [f, setF] = useState({ logoUrl: "", primaryColor: "", companyTagline: "", customDomain: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (org) setF({ logoUrl: org.branding?.logoUrl ?? "", primaryColor: org.branding?.primaryColor ?? "", companyTagline: org.branding?.companyTagline ?? "", customDomain: org.branding?.customDomain ?? "" }); }, [org]);
  if (!org) return null;
  const dirty = f.logoUrl !== (org.branding?.logoUrl ?? "") || f.primaryColor !== (org.branding?.primaryColor ?? "") || f.companyTagline !== (org.branding?.companyTagline ?? "") || f.customDomain !== (org.branding?.customDomain ?? "");
  const save = () => {
    setSaving(true); setSaved(false);
    agency.updateSubAccountBranding(org.id, { logoUrl: f.logoUrl.trim() || undefined, primaryColor: f.primaryColor.trim() || undefined, companyTagline: f.companyTagline.trim() || undefined, customDomain: f.customDomain.trim() || undefined });
    window.setTimeout(() => { setSaving(false); setSaved(true); }, 600);
  };
  const initials = org.name.replace(/^\[TEST\]\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <SectionCard icon={Palette} title="Profile & branding" description={`${org.name} · ${org.publicId}. What your team and your clients see on portals and letters. The Organization ID is permanent.`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={labelCls}>Logo URL</span><input value={f.logoUrl} onChange={(e) => setF((x) => ({ ...x, logoUrl: e.target.value }))} disabled={!canEdit} placeholder="https://…/logo.png" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Primary colour</span>
            <div className="flex items-center gap-2"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(f.primaryColor) ? f.primaryColor : "#0f6e56"} onChange={(e) => setF((x) => ({ ...x, primaryColor: e.target.value }))} disabled={!canEdit} className="h-9 w-12 cursor-pointer rounded border border-border bg-background" aria-label="Primary colour" /><input value={f.primaryColor} onChange={(e) => setF((x) => ({ ...x, primaryColor: e.target.value }))} disabled={!canEdit} placeholder="#0f6e56" className={inputCls} /></div>
          </label>
          <label className="block sm:col-span-2"><span className={labelCls}>Tagline</span><input value={f.companyTagline} onChange={(e) => setF((x) => ({ ...x, companyTagline: e.target.value }))} disabled={!canEdit} placeholder="Shown under your name on client-facing pages" className={inputCls} /></label>
          <label className="block sm:col-span-2"><span className={labelCls}>Custom domain (optional)</span><input value={f.customDomain} onChange={(e) => setF((x) => ({ ...x, customDomain: e.target.value }))} disabled={!canEdit} placeholder="portal.yourcompany.com" className={inputCls} /><span className="mt-1 block text-[10px] text-muted-foreground">Recorded now; pointing the domain at BES is a setup step with the BES team.</span></label>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className={labelCls}>Preview</p>
          <div className="flex items-center gap-3">
            {f.logoUrl ? <img src={f.logoUrl} alt="" className="h-11 w-11 rounded-xl object-contain" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: f.primaryColor || "hsl(var(--primary))" }}>{initials}</div>}
            <div><p className="text-sm font-bold text-foreground">{org.name.replace(/^\[TEST\]\s*/, "")}</p><p className="text-[11px] text-muted-foreground">{f.companyTagline || "Your tagline"}</p></div>
          </div>
          <div className="mt-3 h-2 rounded-full" style={{ background: f.primaryColor || "hsl(var(--primary))" }} />
        </div>
      </div>
      {canEdit && (
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save branding</Button>
          {saved && !dirty && <span className="text-xs text-status-success">Saved.</span>}
        </div>
      )}
    </SectionCard>
  );
}

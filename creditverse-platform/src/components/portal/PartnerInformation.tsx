/**
 * Business information and the signed-in contact's own details, on the
 * portal's Account Settings — the same records onboarding filled, kept current
 * by the partner through my_partner_profile_save(), which writes the partner
 * row and the caller's OWN contact row only, and audits the change.
 *
 * The partner's system logins are PartnerSystems, further down the page.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Pencil, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMyPartnerProfile, type AgencyPartner } from "@/lib/data/agency-partners";
import { useToast } from "@/hooks/use-toast";

export function PartnerInformation({ partner, contactName, contactTitle, contactPhone, contactEmail }: {
  partner: AgencyPartner; contactName: string | null; contactTitle: string | null; contactPhone: string | null; contactEmail: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingCompany, setEditingCompany] = useState(false);
  const [editingContact, setEditingContact] = useState(false);

  const profile = useMutation({
    mutationFn: saveMyPartnerProfile,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partner", "me"] });
      setEditingCompany(false); setEditingContact(false);
      toast({ title: "Saved to your Partner Profile" });
    },
    onError: (e) => toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" }),
  });

  const [co, setCo] = useState({
    legal: partner.legalBusinessName ?? partner.name, dba: partner.dbaName ?? "", street: partner.addressStreet ?? "",
    city: partner.addressCity ?? "", state: partner.addressState ?? "", zip: partner.addressZip ?? "",
    website: partner.website ?? "", phone: partner.phone ?? "", email: partner.contactEmail ?? "",
  });
  const nameParts = (contactName ?? "").trim().split(/\s+/);
  const [ct, setCt] = useState({ first: nameParts[0] ?? "", last: nameParts.slice(1).join(" "), title: contactTitle ?? "", mobile: contactPhone ?? "" });

  const address = [partner.addressStreet, partner.addressCity, [partner.addressState, partner.addressZip].filter(Boolean).join(" ")]
    .filter((x) => x && x.trim()).join(", ") || partner.address;

  const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{value && value.trim() ? value : <span className="text-muted-foreground">Not recorded</span>}</dd>
    </div>
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" /> Business information
      </h2>

      {/* Company information */}
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold text-foreground">Company Information</h3>
          {!editingCompany && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingCompany(true)}><Pencil className="mr-1 h-3 w-3" /> Edit</Button>
          )}
        </div>
        {editingCompany ? (
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><Label className="text-xs">Legal business name</Label><Input value={co.legal} onChange={(e) => setCo({ ...co, legal: e.target.value })} /></div>
              <div><Label className="text-xs">DBA / brand name</Label><Input value={co.dba} onChange={(e) => setCo({ ...co, dba: e.target.value })} /></div>
            </div>
            <div>
              <Label className="text-xs">Business address</Label>
              <Input value={co.street} onChange={(e) => setCo({ ...co, street: e.target.value })} placeholder="Street" />
              <div className="mt-1.5 grid grid-cols-[1fr_5rem_6rem] gap-1.5">
                <Input value={co.city} onChange={(e) => setCo({ ...co, city: e.target.value })} placeholder="City" aria-label="City" />
                <Input value={co.state} onChange={(e) => setCo({ ...co, state: e.target.value })} placeholder="State" aria-label="State" />
                <Input value={co.zip} onChange={(e) => setCo({ ...co, zip: e.target.value })} placeholder="ZIP" aria-label="ZIP" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div><Label className="text-xs">Website</Label><Input value={co.website} onChange={(e) => setCo({ ...co, website: e.target.value })} /></div>
              <div><Label className="text-xs">Business phone</Label><Input value={co.phone} onChange={(e) => setCo({ ...co, phone: e.target.value })} /></div>
              <div><Label className="text-xs">Main business email</Label><Input value={co.email} onChange={(e) => setCo({ ...co, email: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={profile.isPending || !co.legal.trim()} onClick={() => profile.mutate({
                legalBusinessName: co.legal, dbaName: co.dba, addressStreet: co.street, addressCity: co.city, addressState: co.state,
                addressZip: co.zip, website: co.website, phone: co.phone, contactEmail: co.email,
              })}>{profile.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingCompany(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Legal business name" value={partner.legalBusinessName ?? partner.name} />
            <Row label="DBA / brand" value={partner.dbaName} />
            <Row label="Business address" value={address} />
            <Row label="Website" value={partner.website} />
            <Row label="Business phone" value={partner.phone} />
            <Row label="Main business email" value={partner.contactEmail} />
          </dl>
        )}
      </div>

      {/* Primary contact */}
      <div className="mt-3 rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-foreground"><UserRound className="h-3.5 w-3.5 text-muted-foreground" /> Your details</h3>
          {!editingContact && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingContact(true)}><Pencil className="mr-1 h-3 w-3" /> Edit</Button>
          )}
        </div>
        {editingContact ? (
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><Label className="text-xs">First name</Label><Input value={ct.first} onChange={(e) => setCt({ ...ct, first: e.target.value })} /></div>
              <div><Label className="text-xs">Last name</Label><Input value={ct.last} onChange={(e) => setCt({ ...ct, last: e.target.value })} /></div>
              <div><Label className="text-xs">Title / role</Label><Input value={ct.title} onChange={(e) => setCt({ ...ct, title: e.target.value })} /></div>
              <div><Label className="text-xs">Mobile number</Label><Input value={ct.mobile} onChange={(e) => setCt({ ...ct, mobile: e.target.value })} /></div>
            </div>
            <p className="text-[11px] text-muted-foreground">Your email ({contactEmail}) is your sign-in and is changed by BES on request.</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={profile.isPending || !ct.first.trim()} onClick={() => profile.mutate({ firstName: ct.first, lastName: ct.last, title: ct.title, mobile: ct.mobile })}>
                {profile.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingContact(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            <Row label="Name" value={contactName} />
            <Row label="Title / role" value={contactTitle} />
            <Row label="Email" value={contactEmail} />
            <Row label="Mobile" value={contactPhone} />
          </dl>
        )}
      </div>

    </section>
  );
}

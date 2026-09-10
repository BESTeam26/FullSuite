/**
 * Edit the partner record — the fields a person actually corrects.
 *
 * Dee's vocabulary is the form's (2026-09-09: "ensure we mapped Partner Name
 * and Company Name correctly"): the COMPANY is the account and fills both
 * name columns so no surface can disagree with another; the PARTNER is the
 * person. Lifecycle has its own control on the header; archiving has its own
 * dialog — this edits facts, not state.
 */
import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { OpsSelect } from "@/components/ui/ops-select";
import { usePartnerActions } from "@/lib/data/use-agency-partners";
import type { AgencyPartner } from "@/lib/data/agency-partners";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";
import { useToast } from "@/hooks/use-toast";

const NONE = "__none__";

export function EditPartnerDialog({ partner, people, teams }: {
  partner: AgencyPartner;
  people: AgencyPerson[];
  teams: AgencyTeam[];
}) {
  const actions = usePartnerActions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState(partner.name);
  const [person, setPerson] = useState(partner.primaryContact ?? "");
  const [email, setEmail] = useState(partner.contactEmail);
  const [phone, setPhone] = useState(partner.phone ?? "");
  const [startedOn, setStartedOn] = useState(partner.startedOn ?? "");
  const [saasPlan, setSaasPlan] = useState(partner.saasPlan ?? "");
  const [contractRef, setContractRef] = useState(partner.contractRef ?? "");
  const [manager, setManager] = useState(partner.accountManagerId ?? NONE);
  const [team, setTeam] = useState(partner.teamId ?? NONE);
  const [notes, setNotes] = useState(partner.notes ?? "");
  const [legal, setLegal] = useState(partner.legalBusinessName ?? "");
  const [dba, setDba] = useState(partner.dbaName ?? "");
  const [street, setStreet] = useState(partner.addressStreet ?? "");
  const [city, setCity] = useState(partner.addressCity ?? "");
  const [state, setState] = useState(partner.addressState ?? "");
  const [zip, setZip] = useState(partner.addressZip ?? "");
  const [website, setWebsite] = useState(partner.website ?? "");

  const reset = () => {
    setLegal(partner.legalBusinessName ?? ""); setDba(partner.dbaName ?? "");
    setStreet(partner.addressStreet ?? ""); setCity(partner.addressCity ?? ""); setState(partner.addressState ?? ""); setZip(partner.addressZip ?? "");
    setWebsite(partner.website ?? "");
    setCompany(partner.name);
    setPerson(partner.primaryContact ?? "");
    setEmail(partner.contactEmail);
    setPhone(partner.phone ?? "");
    setStartedOn(partner.startedOn ?? "");
    setSaasPlan(partner.saasPlan ?? "");
    setContractRef(partner.contractRef ?? "");
    setManager(partner.accountManagerId ?? NONE);
    setTeam(partner.teamId ?? NONE);
    setNotes(partner.notes ?? "");
  };

  const save = () =>
    actions.update.mutate(
      {
        id: partner.id,
        patch: {
          name: company.trim(),
          companyName: company.trim(),
          primaryContact: person,
          contactEmail: email.trim(),
          phone,
          startedOn: startedOn || null,
          saasPlan,
          contractRef,
          accountManagerId: manager === NONE ? null : manager,
          teamId: team === NONE ? null : team,
          notes,
          legalBusinessName: legal, dbaName: dba, addressStreet: street, addressCity: city, addressState: state, addressZip: zip, website,
          address: [street, city, [state, zip].filter(Boolean).join(" ")].filter((x) => x && x.trim()).join(", "),
        },
      },
      {
        onSuccess: () => { setOpen(false); toast({ title: "Partner updated" }); },
        onError: (e) => toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" }),
      },
    );

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit partner</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ep-company">Company / business name</Label>
            <Input id="ep-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="ep-legal">Legal business name</Label>
              <Input id="ep-legal" value={legal} onChange={(e) => setLegal(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ep-dba">DBA / brand name</Label>
              <Input id="ep-dba" value={dba} onChange={(e) => setDba(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="ep-street">Business address</Label>
            <Input id="ep-street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street address" />
            <div className="mt-1.5 grid grid-cols-[1fr_5rem_6rem] gap-1.5">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" aria-label="City" />
              <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" aria-label="State" />
              <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" aria-label="ZIP code" />
            </div>
          </div>
          <div>
            <Label htmlFor="ep-website">Business website</Label>
            <Input id="ep-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label htmlFor="ep-person">Partner (person)</Label>
            <Input id="ep-person" value={person} onChange={(e) => setPerson(e.target.value)}
              placeholder="e.g. Lloyd Argame" />
          </div>
          <div>
            <Label htmlFor="ep-email">Contact email</Label>
            <Input id="ep-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ep-phone">Phone</Label>
            <Input id="ep-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ep-started">Started</Label>
              <Input id="ep-started" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ep-plan">BES SaaS plan</Label>
              <Input id="ep-plan" value={saasPlan} onChange={(e) => setSaasPlan(e.target.value)}
                placeholder="e.g. Grow" />
            </div>
          </div>
          <div>
            <Label htmlFor="ep-contract">Contract reference</Label>
            <Input id="ep-contract" value={contractRef} onChange={(e) => setContractRef(e.target.value)}
              placeholder="Agreement name, number, or link" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Account manager</Label>
              <OpsSelect size="field" value={manager} onValueChange={setManager}
                options={[{ value: NONE, label: "Unassigned" },
                  ...people.map((s) => ({ value: s.userId, label: s.name }))]} />
            </div>
            <div>
              <Label>Team</Label>
              <OpsSelect size="field" value={team} onValueChange={setTeam}
                options={[{ value: NONE, label: "None" },
                  ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
            </div>
          </div>
          <div>
            <Label htmlFor="ep-notes">Notes</Label>
            <textarea id="ep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={6}
              className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Never put a password here — notes are readable by anyone with partner access.
              Credentials live on the Logins tab, which encrypts them and audits every read.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={!company.trim() || actions.update.isPending} onClick={save}>
            {actions.update.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

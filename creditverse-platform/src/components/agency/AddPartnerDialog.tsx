/**
 * Add a BES Partner.
 *
 * Two required fields: name and email. Everything else is optional and
 * editable later. A phone number nobody has to hand must never stop somebody
 * recording a partner they just agreed terms with — a form that refuses is how
 * records fill up with "n/a" and "000-0000".
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { usePartnerActions } from "@/lib/data/use-agency-partners";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddPartnerDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void;
}) {
  const actions = usePartnerActions();
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL.test(contactEmail.trim());
  const ready = name.trim().length > 0 && emailValid;

  const submit = async () => {
    if (!ready) return;
    setError(null);
    try {
      const id = await actions.create.mutateAsync({
        name, contactEmail, companyName, phone, service, notes,
      });
      setName(""); setContactEmail(""); setCompanyName(""); setPhone(""); setService(""); setNotes("");
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The partner could not be created.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a BES Partner</DialogTitle>
          <DialogDescription>
            A partner does not need a software subscription or an organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name <span className="text-status-danger">*</span></span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="What we call them" aria-label="Partner name" className="mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email <span className="text-status-danger">*</span></span>
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
              placeholder="name@company.com" aria-label="Contact email" className="mt-1" />
            {contactEmail.trim() !== "" && !emailValid && (
              <span className="mt-0.5 block text-xs text-status-danger">That does not look like an email address.</span>
            )}
          </label>

          <p className="pt-1 text-xs text-muted-foreground">Everything below is optional.</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name" aria-label="Company name" />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone" aria-label="Phone" />
          </div>
          <Input value={service} onChange={(e) => setService(e.target.value)}
            placeholder="Service or relationship" aria-label="Service" />
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes" aria-label="Notes" />

          {error && <p className="text-sm text-status-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={actions.create.isPending}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!ready || actions.create.isPending}>
            {actions.create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Add partner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

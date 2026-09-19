/**
 * Personal Records — the private HR facts management keeps about a person:
 * full date of birth (for age verification), address, WhatsApp, emergency
 * contact. Rendered only for management in scope; a team lead never sees it,
 * and the database returns nothing to anyone else (member_private_records).
 */
import { useEffect, useState } from "react";
import { Loader2, Lock, Pencil, ShieldAlert } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/agency/partner/partner-ui";
import { useToast } from "@/hooks/use-toast";
import { useMemberPrivateRecord, useSaveMemberPrivateRecord, type MemberPrivateRecordEdits } from "@/lib/data/member-private-records";
import { ageLabel } from "@/lib/people/age";
import { formatDate } from "@/lib/format-date";

const EMPTY: MemberPrivateRecordEdits = {
  dateOfBirth: null, homeAddress: null, workingLocation: null, whatsappPhone: null,
  emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null,
};

export function PersonalRecordsCard({ userId }: { userId: string }) {
  const { toast } = useToast();
  const record = useMemberPrivateRecord(userId);
  const save = useSaveMemberPrivateRecord(userId);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<MemberPrivateRecordEdits>(EMPTY);
  useEffect(() => { if (record.data) setEdits({ ...EMPTY, ...record.data }); }, [record.data]);

  const r = record.data;
  const age = r?.dateOfBirth ? ageLabel(r.dateOfBirth) : null;
  const set = <K extends keyof MemberPrivateRecordEdits>(k: K, v: string) => setEdits((p) => ({ ...p, [k]: v }));
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="text-right font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  );
  const field = (label: string, k: keyof MemberPrivateRecordEdits, type = "text") => (
    <label key={k} className="text-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Input type={type} value={edits[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="mt-0.5 h-8 text-xs" /></label>
  );

  return (
    <ContentCard title={<span className="flex items-center gap-2"><Lock className="h-4 w-4 text-muted-foreground" /> Personal Records</span>}>
      {record.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : editing ? (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          save.mutate(edits, {
            onSuccess: () => { setEditing(false); toast({ title: "Personal records saved" }); },
            onError: (err) => toast({ title: "Could not save", description: (err as Error).message, variant: "destructive" }),
          });
        }}>
          {field("Date of birth", "dateOfBirth", "date")}
          {field("Working location", "workingLocation")}
          <div className="sm:col-span-2">{field("Home address", "homeAddress")}</div>
          {field("WhatsApp", "whatsappPhone")}
          {field("Emergency contact", "emergencyContactName")}
          {field("Relationship", "emergencyContactRelationship")}
          {field("Emergency phone", "emergencyContactPhone")}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={save.isPending}>{save.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <>
          <dl className="divide-y divide-border/60">
            {row("Date of birth", r?.dateOfBirth ? (
              <span className="inline-flex items-center gap-2">{formatDate(r.dateOfBirth)}
                {age && <Pill tone={age.minor ? "border-status-danger/40 bg-status-danger/10 text-status-danger" : "border-border bg-muted text-muted-foreground"}>
                  {age.minor && <ShieldAlert className="mr-1 h-3 w-3" aria-hidden />}{age.text}</Pill>}
              </span>) : null)}
            {row("Working location", r?.workingLocation)}
            {row("Home address", r?.homeAddress)}
            {row("WhatsApp", r?.whatsappPhone)}
            {row("Emergency contact", r?.emergencyContactName ? `${r.emergencyContactName}${r.emergencyContactRelationship ? ` (${r.emergencyContactRelationship})` : ""}` : null)}
            {row("Emergency phone", r?.emergencyContactPhone)}
          </dl>
          <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={() => setEditing(true)}><Pencil className="mr-1 h-3 w-3" aria-hidden /> Edit records</Button>
        </>
      )}
    </ContentCard>
  );
}

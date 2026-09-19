/**
 * Edit a team member's profile — photo, name, preferred name, title, phone
 * and quote. Offered to the person and to management within scope; the
 * database (may_manage_profile_of) is what actually decides, on every write.
 * Position, teams and reporting are not here: they are organization facts,
 * changed on the placement card, not the person's own words about themselves.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAvatarUrls } from "@/lib/data/use-account";
import { memberProfileProblem, useMemberProfileActions, type MemberProfileEdits } from "@/lib/data/member-profile";
import { MAX_AVATAR_BYTES } from "@/lib/data/account";
import { useToast } from "@/hooks/use-toast";
import type { AgencyMember } from "@/lib/data/agency-teams";
import { initialsOf } from "@/components/people/profile/ProfileHeader";

export function EditMemberProfileDialog({ member, open, onClose }: { member: AgencyMember; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const actions = useMemberProfileActions(member.userId);
  const avatars = useAvatarUrls([member.avatarPath]);
  const url = member.avatarPath ? avatars.data?.[member.avatarPath] : undefined;
  const fileRef = useRef<HTMLInputElement>(null);
  const [edits, setEdits] = useState<MemberProfileEdits>({ fullName: "", preferredName: "", title: "", phone: "", tagline: "" });
  const [problem, setProblem] = useState<string | null>(null);

  /* Fill from the record each time the dialog opens; afterwards the form belongs to the typist. */
  useEffect(() => {
    if (!open) return;
    setEdits({
      fullName: member.name, preferredName: member.preferredName ?? "", title: member.profileTitle ?? "",
      phone: member.phone ?? "", tagline: member.tagline ?? "",
    });
    setProblem(null);
  }, [open, member]);

  const set = <K extends keyof MemberProfileEdits>(k: K, v: MemberProfileEdits[K]) => setEdits((e) => ({ ...e, [k]: v }));
  const save = () => {
    const p = memberProfileProblem(edits);
    if (p) { setProblem(p); return; }
    actions.save.mutate(edits, {
      onSuccess: () => { toast({ title: "Profile saved" }); onClose(); },
      onError: (e) => setProblem((e as Error).message),
    });
  };
  const pick = (file: File | undefined) => {
    if (!file) return;
    actions.upload.mutate({ file, previousPath: member.avatarPath }, {
      onSuccess: () => toast({ title: "Photo updated" }),
      onError: (e) => setProblem((e as Error).message),
    });
  };
  const busy = actions.save.isPending || actions.upload.isPending || actions.remove.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-xl font-bold text-primary">
              {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initialsOf(member.name)}
            </span>
            <div className="space-y-1.5">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {actions.upload.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1.5 h-3.5 w-3.5" />} Upload photo
                </Button>
                {member.avatarPath && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy}
                    onClick={() => actions.remove.mutate(member.avatarPath, { onError: (e) => setProblem((e as Error).message) })}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">PNG, JPG or WebP up to {Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB. Shown at small sizes.</p>
              {member.employeeCode && <p className="text-[11px] text-muted-foreground">Employee ID <span className="font-semibold text-foreground">{member.employeeCode}</span> — assigned at hire, not editable.</p>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">Full name
              <Input value={edits.fullName} onChange={(e) => set("fullName", e.target.value)} className="mt-1 h-9 text-sm" maxLength={120} />
            </label>
            <label className="text-xs text-muted-foreground">Preferred name
              <Input value={edits.preferredName} onChange={(e) => set("preferredName", e.target.value)} className="mt-1 h-9 text-sm" maxLength={60} placeholder="Optional" />
            </label>
            <label className="text-xs text-muted-foreground">Title (as they call their role)
              <Input value={edits.title} onChange={(e) => set("title", e.target.value)} className="mt-1 h-9 text-sm" maxLength={80} placeholder="Optional" />
            </label>
            <label className="text-xs text-muted-foreground">Phone
              <Input value={edits.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1 h-9 text-sm" maxLength={40} placeholder="Optional" />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">Quote on the profile
            <Input value={edits.tagline} onChange={(e) => set("tagline", e.target.value)} className="mt-1 h-9 text-sm" maxLength={200}
              placeholder="A line that sums up how they work — optional" />
          </label>
          <p className="text-[11px] text-muted-foreground">Position, team and reporting line are organization facts — change them on the placement card, not here.</p>
          {problem && <p className="text-xs text-status-danger">{problem}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={busy}>{actions.save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

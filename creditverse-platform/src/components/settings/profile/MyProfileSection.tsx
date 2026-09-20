/**
 * Settings › My Profile — the person's own view of the canonical person record.
 *
 * Dee, 2026-09-19: "Settings → My Profile should be exactly that: identity,
 * contact information, and BES profile information. Nothing operational."
 * Work, time, attendance, schedule, time off and EOD are NOT here — they have
 * their homes (My Work, Time & Attendance) and Settings never grows a second
 * path to them. Training and rewards are the person's own record, so they
 * stay, compactly, at the bottom.
 *
 * Same record as the management Team Member Profile (memberships, profile,
 * teams, positions, documents, reward ledger) — a narrower view of it, never
 * a copy. Organizational facts are read-only here for everybody, the owner
 * included: management of the record belongs to People & Teams.
 */
import { useMemo, useState } from "react";
import { Award, Building2, Camera, FileText, KeyRound, Loader2, Lock, Mail, Pencil, Phone, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/agency/partner/partner-ui";
import { AccountSection } from "@/components/settings/sections/AccountSection";
import { useAuth } from "@/lib/auth/auth-context";
import { useOwnProfile, useAvatarUrls } from "@/lib/data/use-account";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { useWorkforce } from "@/lib/data/use-workforce";
import { usePositions } from "@/lib/data/use-positions";
import { useMemberDocuments } from "@/lib/data/member-documents";
import { useMyRewards } from "@/lib/leave/use-rewards";
import { useMemberPrivateRecord } from "@/lib/data/member-private-records";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { engagementTypeLabel } from "@/lib/agency/engagement-type";
import { formatDate } from "@/lib/format-date";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const ACTIVE = "border-emerald-500/40 bg-emerald-500/10 text-emerald-800";
const INACTIVE = "border-border bg-muted text-muted-foreground";

/** Which way this session signed in, read from the auth user — never guessed. */
function signInMethods(user: { app_metadata?: Record<string, unknown> } | null | undefined): string[] {
  const providers = (user?.app_metadata?.providers as unknown) ?? user?.app_metadata?.provider;
  const list = Array.isArray(providers) ? providers : typeof providers === "string" ? [providers] : [];
  return list.map((p) => (p === "email" ? "Email & password" : p === "google" ? "Google account" : String(p)));
}

type Editing = "none" | "profile" | "password";

export function MyProfileSection() {
  const auth = useAuth();
  const account = useOwnProfile();
  const members = useAgencyMembers();
  const workforce = useWorkforce();
  const positions = usePositions();
  const [editing, setEditing] = useState<Editing>("none");
  /* The person reads their own private record; management writes the date. */
  const privateRecord = useMemberPrivateRecord(auth.user?.id ?? null);

  const me = (members.data ?? []).find((m) => m.userId === auth.user?.id) ?? null;
  const profile = account.profile;
  const avatars = useAvatarUrls([profile?.avatarPath]);
  const url = profile?.avatarPath ? avatars.data?.[profile.avatarPath] : undefined;
  const myTeams = useMemo(
    () => (workforce.data?.teams ?? []).filter((t) => !t.archived && t.members.some((m) => m.userId === auth.user?.id)),
    [workforce.data, auth.user?.id],
  );
  const team = myTeams[0];
  const leadId = myTeams.flatMap((t) => t.members).find((m) => m.isLead && m.userId !== auth.user?.id)?.userId ?? me?.managerId ?? null;
  const nameOf = (id: string | null | undefined) => (id ? (members.data ?? []).find((m) => m.userId === id)?.name ?? null : null);
  const seat = (positions.data ?? []).find((p) => p.holders.some((h) => h.userId === auth.user?.id))?.title ?? me?.jobTitle ?? null;
  const displayName = profile?.preferredName || profile?.fullName || auth.displayName;
  const methods = signInMethods(auth.user);

  if (account.isLoading || members.isLoading) {
    return <p className="py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading your profile…</p>;
  }

  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex items-start justify-between gap-4 py-2 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  );
  const toggle = (next: Editing) => setEditing((cur) => (cur === next ? "none" : next));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative h-28 w-28 shrink-0">
            <button type="button" aria-label="Change photo" onClick={() => toggle("profile")}
              className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-3xl font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initialsOf(displayName)}
            </button>
            <span className="pointer-events-none absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow">
              <Camera className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-extrabold text-foreground">{profile?.fullName ?? displayName}</h2>
              {me && <Pill tone={me.status === "active" ? ACTIVE : INACTIVE}>{me.status === "active" ? "Active" : "Inactive"}</Pill>}
            </div>
            {seat && <p className="mt-0.5 text-sm font-semibold text-foreground">{seat}</p>}
            {me?.employeeCode && (
              <p className="text-xs text-muted-foreground">Agent ID: <span className="font-semibold tabular-nums text-foreground">{me.employeeCode}</span></p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground">
              {profile?.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-primary" aria-hidden />{profile.email}</span>}
              {profile?.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" aria-hidden />{profile.phone}</span>}
            </div>
            {profile?.tagline
              ? <p className="mt-2 text-sm italic text-muted-foreground">“{profile.tagline}”</p>
              : <p className="mt-2 text-xs text-muted-foreground">Add a line under your name with Edit Profile.</p>}
          </div>
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => toggle("profile")}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {editing === "profile" ? "Close editor" : "Edit Profile"}
          </Button>
        </div>
      </div>

      {editing === "profile" && <AccountSection mode="profile" />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Personal Information" icon={UserRound}
          action={<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggle("profile")}><Pencil className="mr-1 h-3 w-3" aria-hidden /> Edit</Button>}>
          <dl className="divide-y divide-border/60">
            {row("Full Name", profile?.fullName)}
            {row("Preferred Name", profile?.preferredName)}
            {row("Work Email", profile?.email)}
            {row("Phone", profile?.phone)}
            {row("Birthday", privateRecord.data?.dateOfBirth ? formatDate(privateRecord.data.dateOfBirth)
              : profile?.birthMonth && profile?.birthDay ? `${MONTHS[profile.birthMonth - 1]} ${profile.birthDay}` : null)}
            {row("Tagline / Quote", profile?.tagline)}
          </dl>
        </Card>
        <Card title="BES Profile" icon={Building2}
          action={<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" aria-hidden /> Managed by Administration</span>}>
          <dl className="divide-y divide-border/60">
            {row("Agent ID", me?.employeeCode ? <span className="tabular-nums">{me.employeeCode}</span> : null)}
            {row("Position", seat)}
            {row("Division", team?.division ? orgDivisionLabel(team.division) : null)}
            {row("Department", team?.department ?? null)}
            {row("Team", myTeams.map((t) => t.name).join(", ") || null)}
            {row("Reports To", nameOf(leadId))}
            {/* The hire date only. Falling back to the account date told
                somebody who activated today that they started today. */}
            {row("Start Date", me?.hiredOn ? formatDate(me.hiredOn) : null)}
            {row("Engagement Type", engagementTypeLabel(me?.engagementType))}
            {row("Status", me ? <Pill tone={me.status === "active" ? ACTIVE : INACTIVE}>{me.status === "active" ? "Active" : "Inactive"}</Pill> : null)}
          </dl>
        </Card>
      </div>

      <Card title="Account & Security" icon={ShieldCheck}>
        <dl className="divide-y divide-border/60">
          {row("Login Email", auth.user?.email ?? null)}
          {row("Password", (
            <span className="inline-flex items-center gap-3">
              <span aria-hidden>••••••••</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggle("password")}>
                <KeyRound className="mr-1 h-3 w-3" aria-hidden /> {editing === "password" ? "Close" : "Change Password"}
              </Button>
            </span>
          ))}
          {methods.length > 0 && row("Sign-in Method", methods.join(" · "))}
        </dl>
        {editing === "password" && <div className="mt-3"><AccountSection mode="password" /></div>}
      </Card>

      {me && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TrainingCard userId={me.userId} />
          <RewardsCard />
        </div>
      )}
    </div>
  );
}

/** Training documents management has made visible to the person — their own record. */
function TrainingCard({ userId }: { userId: string }) {
  const docs = useMemberDocuments(userId, true);
  const training = (docs.data ?? []).filter((d) => d.kind === "training");
  return (
    <Card title="Training & Certifications" icon={FileText}>
      {docs.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
        : training.length === 0 ? <p className="text-xs text-muted-foreground">No training documents on file yet.</p> : (
          <ul className="space-y-2">
            {training.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-xs">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success"><FileText className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{d.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{d.signedAt ? `Completed ${formatDate(d.signedAt)}` : d.status.replace(/_/g, " ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}

/** The person's own reward ledger — birthday and Attendance Champion credits. */
function RewardsCard() {
  const rewards = useMyRewards();
  const list = rewards.data ?? [];
  return (
    <Card title="Rewards & Recognition" icon={Award}>
      {rewards.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
        : list.length === 0 ? <p className="text-xs text-muted-foreground">No rewards yet. Attendance Champion is awarded each quarter from your attendance record.</p> : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-xs">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700"><Award className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">{r.label}{r.sourceQuarter ? ` · ${r.sourceQuarter}` : ""}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    Issued {formatDate(r.issuedOn)}{r.consumedAt ? ` · used ${formatDate(r.consumedAt)}` : ` · valid until ${formatDate(r.expiresOn)}`}
                  </span>
                </span>
                <Pill tone={r.consumedAt ? INACTIVE : ACTIVE}>{r.consumedAt ? "Used" : `${r.days} day${r.days === 1 ? "" : "s"}`}</Pill>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}

function Card({ title, icon: Icon, action, children }: {
  title: string; icon?: React.ElementType; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">{Icon && <Icon className="h-4 w-4 text-primary" aria-hidden />}{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

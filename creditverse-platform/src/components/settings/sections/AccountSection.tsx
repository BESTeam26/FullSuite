/**
 * Your account — the one settings section every signed-in person has.
 *
 * Photo, how you are known (full name, preferred name, job title), how you
 * are reached (email, phone), your birthday for greetings, and your password.
 * The birthday is a month and a day only, and it is shown to teammates only
 * if you say so. Passwords are typed here and sent straight to the sign-in
 * service; the application never stores or logs one.
 */
import { useEffect, useRef, useState } from "react";
import { Cake, Camera, KeyRound, Loader2, Mail, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/shared";
import { Avatar } from "@/components/common/Avatar";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import {
  MIN_PASSWORD_LENGTH,
  avatarProblem,
  passwordProblem,
  profileProblem,
  sendPasswordReset,
  updateOwnPassword,
  type ProfileEdits,
} from "@/lib/data/account";
import { useAvatarUrls, useOwnProfile } from "@/lib/data/use-account";
import { MONTH_NAMES, daysInMonth } from "@/lib/greetings/birthday";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

const EMPTY: ProfileEdits = { fullName: "", preferredName: "", title: "", phone: "", birthMonth: null, birthDay: null, birthdayVisible: false };

export function AccountSection() {
  const auth = useAuth();
  const account = useOwnProfile();
  const avatars = useAvatarUrls([account.profile?.avatarPath]);
  const avatarUrl = account.profile?.avatarPath ? avatars.data?.[account.profile.avatarPath] : null;
  const fileRef = useRef<HTMLInputElement>(null);

  const [edits, setEdits] = useState<ProfileEdits>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  /* The form fills once from the saved row, then belongs to the person typing. */
  useEffect(() => {
    if (loaded || !account.profile) return;
    setEdits({
      fullName: account.profile.fullName ?? "",
      preferredName: account.profile.preferredName ?? "",
      title: account.profile.title ?? "",
      phone: account.profile.phone ?? "",
      birthMonth: account.profile.birthMonth,
      birthDay: account.profile.birthDay,
      birthdayVisible: account.profile.birthdayVisible,
    });
    setLoaded(true);
  }, [account.profile, loaded]);

  const problem = profileProblem(edits);
  const set = <K extends keyof ProfileEdits>(key: K, value: ProfileEdits[K]) => setEdits((p) => ({ ...p, [key]: value }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setMessage(null);
    account.save.mutate(edits, {
      onSuccess: () => setMessage({ text: "Saved.", error: false }),
      onError: (err) => setMessage({ text: errorMessage(err, "Your details could not be saved."), error: true }),
    });
  };

  const pickAvatar = (file: File | undefined) => {
    if (!file) return;
    const bad = avatarProblem(file);
    if (bad) { setMessage({ text: bad, error: true }); return; }
    setMessage(null);
    account.uploadAvatar.mutate(file, {
      onSuccess: () => setMessage({ text: "Photo updated.", error: false }),
      onError: (err) => setMessage({ text: errorMessage(err, "The photo could not be uploaded."), error: true }),
    });
  };

  if (!account.live) {
    return (
      <SectionCard icon={UserRound} title="Your account" description="How you appear to your team, and your sign-in.">
        <p className="text-xs text-muted-foreground">Sign in to change your details.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard icon={UserRound} title="Your account" description="How you appear to your team, and how they reach you.">
        {account.isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={edits.preferredName || edits.fullName || auth.displayName} url={avatarUrl} size="lg" />
              <div className="space-y-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ""; }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={account.uploadAvatar.isPending}>
                    {account.uploadAvatar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1 h-3.5 w-3.5" />} {account.profile?.avatarPath ? "Change photo" : "Add photo"}
                  </Button>
                  {account.profile?.avatarPath && (
                    <Button type="button" size="sm" variant="ghost" disabled={account.removeAvatar.isPending} onClick={() => account.removeAvatar.mutate(account.profile?.avatarPath ?? null)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">PNG, JPG or WEBP, up to 2 MB. Only people you work with can see it.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className={labelCls}>Full name</span>
                <input value={edits.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputCls} maxLength={120} required autoComplete="name" />
              </label>
              <label className="text-sm"><span className={labelCls}>What you like to be called</span>
                <input value={edits.preferredName} onChange={(e) => set("preferredName", e.target.value)} className={inputCls} maxLength={60} placeholder={edits.fullName.split(" ")[0] || "Optional"} />
                <span className="mt-1 block text-[11px] text-muted-foreground">Used in greetings and around the workspace.</span>
              </label>
              <label className="text-sm"><span className={labelCls}>Job title</span>
                <input value={edits.title} onChange={(e) => set("title", e.target.value)} className={inputCls} maxLength={80} placeholder="Optional" />
              </label>
              <label className="text-sm"><span className={labelCls}>Phone</span>
                <input value={edits.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} maxLength={40} placeholder="Optional" autoComplete="tel" inputMode="tel" />
              </label>
              <label className="text-sm sm:col-span-2"><span className={labelCls}>Email</span>
                <input value={auth.user?.email ?? ""} readOnly className={`${inputCls} bg-muted/40 text-muted-foreground`} aria-readonly />
                <span className="mt-1 block text-[11px] text-muted-foreground">Your email is your sign-in and cannot be changed here.</span>
              </label>
            </div>

            <fieldset className="rounded-lg border border-border p-3">
              <legend className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Cake className="h-3 w-3" /> Birthday</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm"><span className={labelCls}>Month</span>
                  <select
                    value={edits.birthMonth ?? ""}
                    onChange={(e) => { const m = e.target.value ? Number(e.target.value) : null; set("birthMonth", m); if (m === null) set("birthDay", null); }}
                    className={inputCls}
                  >
                    <option value="">Not set</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </label>
                <label className="text-sm"><span className={labelCls}>Day</span>
                  <select value={edits.birthDay ?? ""} onChange={(e) => set("birthDay", e.target.value ? Number(e.target.value) : null)} className={inputCls} disabled={edits.birthMonth === null}>
                    <option value="">Not set</option>
                    {Array.from({ length: daysInMonth(edits.birthMonth ?? 1) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
                  <input type="checkbox" checked={edits.birthdayVisible} onChange={(e) => set("birthdayVisible", e.target.checked)} className="h-4 w-4 accent-primary" />
                  Let my team wish me a happy birthday
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">We keep the month and day only — never the year. Nobody sees it unless you tick the box.</p>
            </fieldset>

            {problem && <p className="text-xs text-status-warning">{problem}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={account.save.isPending || !!problem}>
                {account.save.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save details
              </Button>
              {message && <p role="status" className={`text-xs ${message.error ? "text-status-danger" : "text-status-success"}`}>{message.text}</p>}
            </div>
          </form>
        )}
      </SectionCard>

      <PasswordCard email={auth.user?.email ?? ""} />
    </div>
  );
}

function PasswordCard({ email }: { email: string }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });
  const [resetState, setResetState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });
  const problem = next || confirm ? passwordProblem(next, confirm) : null;

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || !next) return;
    setState({ busy: true, message: null, error: false });
    try {
      await updateOwnPassword(next);
      setNext(""); setConfirm("");
      setState({ busy: false, message: "Password changed. Use it the next time you sign in.", error: false });
    } catch (err) {
      setState({ busy: false, message: errorMessage(err, "The password could not be changed."), error: true });
    }
  };

  const reset = async () => {
    if (!email) return;
    setResetState({ busy: true, message: null, error: false });
    try {
      await sendPasswordReset(email);
      setResetState({ busy: false, message: `A reset link is on its way to ${email}.`, error: false });
    } catch (err) {
      setResetState({ busy: false, message: errorMessage(err, "The reset email could not be sent."), error: true });
    }
  };

  return (
    <SectionCard icon={KeyRound} title="Password" description={`At least ${MIN_PASSWORD_LENGTH} characters. Other sessions stay signed in until they expire.`}>
      <form onSubmit={change} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className={labelCls}>New password</span>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
          </label>
          <label className="text-sm"><span className={labelCls}>Repeat new password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
          </label>
        </div>
        {problem && <p className="text-xs text-status-warning">{problem}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={state.busy || !next || !!problem}>
            {state.busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Change password
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={resetState.busy || !email}>
            {resetState.busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1 h-3.5 w-3.5" />} Email me a reset link
          </Button>
        </div>
        {state.message && <p role="status" className={`text-xs ${state.error ? "text-status-danger" : "text-status-success"}`}>{state.message}</p>}
        {resetState.message && <p role="status" className={`text-xs ${resetState.error ? "text-status-danger" : "text-status-success"}`}>{resetState.message}</p>}
      </form>
    </SectionCard>
  );
}

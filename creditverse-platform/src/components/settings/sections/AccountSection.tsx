/**
 * Your account — the one settings section every signed-in person has:
 * display name (own profile row) and password (Supabase Auth). The password
 * is typed by the person and sent straight to the auth service; it is never
 * stored or logged by the application.
 */
import { useState } from "react";
import { KeyRound, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/shared";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { MIN_PASSWORD_LENGTH, passwordProblem, updateOwnDisplayName, updateOwnPassword } from "@/lib/data/account";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function AccountSection() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
  const [name, setName] = useState(auth.displayName);
  const [nameState, setNameState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passState, setPassState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.user || !name.trim()) return;
    setNameState({ busy: true, message: null, error: false });
    try {
      await updateOwnDisplayName(auth.user.id, name);
      await auth.refreshMemberships();
      setNameState({ busy: false, message: "Saved.", error: false });
    } catch (err) {
      setNameState({ busy: false, message: errorMessage(err, "Your name could not be saved."), error: true });
    }
  };

  const problem = next || confirm ? passwordProblem(next, confirm) : null;
  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || !next) return;
    setPassState({ busy: true, message: null, error: false });
    try {
      await updateOwnPassword(next);
      setNext("");
      setConfirm("");
      setPassState({ busy: false, message: "Password changed. Use it the next time you sign in.", error: false });
    } catch (err) {
      setPassState({ busy: false, message: errorMessage(err, "The password could not be changed."), error: true });
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard icon={UserRound} title="Your account" description="How your name appears to teammates, and your sign-in.">
        {!live ? (
          <p className="text-xs text-muted-foreground">Sign in to change your name or password.</p>
        ) : (
          <form onSubmit={saveName} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className={labelCls}>Display name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={120} required autoComplete="name" />
              </label>
              <label className="text-sm">
                <span className={labelCls}>Email</span>
                <input value={auth.user?.email ?? ""} readOnly className={`${inputCls} bg-muted/40 text-muted-foreground`} aria-readonly />
                <span className="mt-1 block text-[11px] text-muted-foreground">Your email is your sign-in and cannot be changed here.</span>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={nameState.busy || !name.trim() || name.trim() === auth.displayName}>
                {nameState.busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save name
              </Button>
              {nameState.message && <p role="status" className={`text-xs ${nameState.error ? "text-status-danger" : "text-status-success"}`}>{nameState.message}</p>}
            </div>
          </form>
        )}
      </SectionCard>

      {live && (
        <SectionCard icon={KeyRound} title="Password" description={`Choose a new password of at least ${MIN_PASSWORD_LENGTH} characters. Other sessions stay signed in until they expire.`}>
          <form onSubmit={savePassword} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className={labelCls}>New password</span>
                <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
              </label>
              <label className="text-sm">
                <span className={labelCls}>Repeat new password</span>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
              </label>
            </div>
            {problem && <p className="text-xs text-status-warning">{problem}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" variant="outline" disabled={passState.busy || !next || !!problem}>
                {passState.busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Change password
              </Button>
              {passState.message && <p role="status" className={`text-xs ${passState.error ? "text-status-danger" : "text-status-success"}`}>{passState.message}</p>}
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}

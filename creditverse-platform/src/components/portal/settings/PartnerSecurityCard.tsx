/**
 * Password and sign-in for the signed-in partner contact (PARTNER_PORTAL_
 * DOCTRINE.md, Account Settings: "Password/security").
 *
 * The password control is the same one staff use (AccountSection's
 * PasswordCard — Supabase Auth, the person's own account only). Signing out
 * other devices revokes this person's other sessions through Supabase Auth;
 * it cannot touch anybody else's.
 */
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { PasswordCard } from "@/components/settings/sections/AccountSection";
import { signOutOtherDevices } from "@/lib/data/account";

export function PartnerSecurityCard() {
  const auth = useAuth();
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });

  const signOutOthers = async () => {
    setState({ busy: true, message: null, error: false });
    try {
      await signOutOtherDevices();
      setState({ busy: false, message: "Signed out everywhere else. This device stays signed in.", error: false });
    } catch {
      setState({ busy: false, message: "Could not sign out the other devices. Try again.", error: true });
    }
  };

  return (
    <div className="space-y-3">
      <PasswordCard email={auth.user?.email ?? ""} />
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Other devices</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Lost a phone, or signed in on a shared computer? Sign out every other device. You stay signed in here.
        </p>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={signOutOthers} disabled={state.busy}>
          {state.busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <LogOut className="mr-1 h-3.5 w-3.5" />} Sign out other devices
        </Button>
        {state.message && <p role="status" className={`mt-2 text-xs ${state.error ? "text-status-danger" : "text-status-success"}`}>{state.message}</p>}
      </section>
    </div>
  );
}

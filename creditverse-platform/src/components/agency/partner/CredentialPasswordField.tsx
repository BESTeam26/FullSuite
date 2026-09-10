import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { useRevealCredential, type CredentialScope } from "@/lib/data/use-partner-credentials";
import { cn } from "@/lib/utils";

/** How long a revealed password stays on screen before hiding itself again. */
const VISIBLE_MS = 30_000;

/**
 * The password: hidden, fetched only when asked for, and hidden again shortly.
 *
 * Every part of this is deliberate.
 *
 * - It is NOT loaded with the rest of the credential. The list query returns
 *   no password at all, so a screenshot of this page, a browser extension
 *   reading the DOM, or somebody walking past cannot pick one up.
 * - Asking writes a line in the access record naming the person, before the
 *   value comes back. That is the trade for keeping the passwords somewhere
 *   the team can actually reach them.
 * - It hides itself again after half a minute, because the common failure is
 *   not an attack — it is a shared screen left on this tab.
 * - "Copy" reveals and copies in one step rather than showing the characters,
 *   since pasting is what people actually want and reading them aloud is not.
 */
export const CredentialPasswordField = ({
  credentialId,
  hasSecret,
  mayReveal,
  scope = "staff",
}: {
  credentialId: string;
  hasSecret: boolean;
  mayReveal: boolean;
  scope?: CredentialScope;
}) => {
  const reveal = useRevealCredential(scope);
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hideTimer = useRef<number>();
  const copyTimer = useRef<number>();

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const fetchSecret = async (): Promise<string | null> => {
    setError(null);
    try {
      return await reveal.mutateAsync(credentialId);
    } catch (e) {
      setError(
        e instanceof Error && /not allowed|may not/i.test(e.message)
          ? "You do not have access to passwords."
          : "The password could not be fetched.",
      );
      return null;
    }
  };

  const onShow = async () => {
    const value = await fetchSecret();
    if (value === null) return;
    setShown(value);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShown(null), VISIBLE_MS);
  };

  const onCopy = async () => {
    const value = shown ?? (await fetchSecret());
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* No clipboard on this origin: show it instead so it can be selected,
         rather than reporting success that did not happen. */
      setShown(value);
      setError("Could not copy — the password is shown so you can select it.");
    }
  };

  if (!hasSecret) {
    return (
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Password
        </div>
        <p className="text-xs text-muted-foreground">
          None stored — signs in another way
        </p>
        <div className="h-4" />
      </div>
    );
  }

  if (!mayReveal) {
    return (
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Password
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Stored — you do not have access
        </p>
        <div className="h-4" />
      </div>
    );
  }

  const busy = reveal.isPending;

  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Password
      </div>
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-xs",
            shown ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {shown ?? "••••••••••••"}
        </span>
        <button
          type="button"
          onClick={() => void onShow()}
          disabled={busy || shown !== null}
          aria-label="Show password"
          className={cn(
            "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:opacity-50",
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void onCopy()}
          disabled={busy}
          aria-label="Copy password"
          className={cn(
            "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:opacity-50",
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-status-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="h-4 text-[10px]" aria-live="polite">
        {error && <span className="text-status-warning">{error}</span>}
        {!error && copied && <span className="text-status-success">Copied</span>}
        {!error && !copied && shown && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <KeyRound className="h-2.5 w-2.5" />
            Recorded in the access log · hides shortly
          </span>
        )}
      </div>
    </div>
  );
};

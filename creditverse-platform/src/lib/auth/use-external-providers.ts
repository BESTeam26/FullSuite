/**
 * Which social sign-in buttons the sign-in page is allowed to show.
 *
 * Asked of the backend rather than hardcoded or put behind a build flag, for
 * one reason: a "Continue with Google" button that fails because nobody has
 * configured Google is a dead visible control, and this project does not ship
 * those. Google is turned on in the Supabase dashboard — no deploy, no
 * environment variable — and the button appears on the next page load.
 *
 * `/auth/v1/settings` is a public, unauthenticated endpoint that reports only
 * which providers are enabled. It carries no secret and needs no session,
 * which is what makes it safe to call from the sign-in page.
 *
 * Failure is silent and closed: if the request does not come back, no social
 * button is offered and email sign-in — always enabled — carries the page.
 */
import { useEffect, useState } from "react";

export interface ExternalProviders {
  google: boolean;
}

const NONE: ExternalProviders = { google: false };

export function useExternalProviders(): ExternalProviders {
  const [providers, setProviders] = useState<ExternalProviders>(NONE);

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return;

    const abort = new AbortController();
    fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: abort.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { external?: Record<string, boolean> } | null) => {
        if (d?.external) setProviders({ google: d.external.google === true });
      })
      .catch(() => {
        /* Closed by default: the page still signs people in by email. */
      });
    return () => abort.abort();
  }, []);

  return providers;
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  archivePartnerCredential,
  fetchCredentialEvents,
  fetchCredentialPlatforms,
  fetchPartnerCredentials,
  revealPartnerCredential,
  savePartnerCredential,
  type SaveCredentialInput,
  fetchMyPartnerCredentials, saveMyPartnerCredential, revealMyPartnerCredential, archiveMyPartnerCredential,
} from "@/lib/data/partner-credentials";

const live = (a: ReturnType<typeof useAuth>) =>
  a.mode === "live" && a.status === "signed-in";

export const credentialsKey = (g: string, archived: boolean) =>
  ["partner", "credentials", g, archived] as const;
export const credentialEventsKey = (id: string) =>
  ["partner", "credential-events", id] as const;
export const credentialPlatformsKey = ["credential-platforms"] as const;

/**
 * The platform catalogue. It changes about once a year, so it is cached for
 * the session rather than refetched per partner profile.
 */
export function useCredentialPlatforms() {
  const auth = useAuth();
  return useQuery({
    queryKey: credentialPlatformsKey,
    queryFn: fetchCredentialPlatforms,
    enabled: live(auth),
    staleTime: 60 * 60_000,
  });
}

/**
 * A partner's logins, without passwords.
 *
 * Deliberately NOT gated on `partners.credentials.view`: knowing that a
 * DisputeFox login exists, and which mailbox its code goes to, is what a
 * fulfilment agent needs to do the job. Only the password itself is behind
 * that capability, and only through `useRevealCredential`.
 */
export function usePartnerCredentials(
  groupId: string | null,
  includeArchived = false,
) {
  const auth = useAuth();
  return useQuery({
    queryKey: credentialsKey(groupId ?? "", includeArchived),
    queryFn: () => fetchPartnerCredentials(groupId!, includeArchived),
    enabled: live(auth) && !!groupId,
    staleTime: 30_000,
  });
}

/** What this person may do here, resolved once for the whole panel. */
export function useCredentialAccess() {
  const perms = useAgencyPermissions();
  return {
    mayReveal: perms.can("partners.credentials.view"),
    mayManage: perms.can("partners.credentials.manage"),
    loading: perms.loading,
  };
}

/**
 * Fetch one password, on demand.
 *
 * A mutation and not a query on purpose: this is an ACTION with a recorded
 * consequence, not data to be cached. A query would refetch on focus and on
 * mount, and each refetch would write another line into the access record
 * saying somebody read the password when nobody did anything at all.
 */
/** Which door: BES staff (the partner record) or the partner themself (the portal). */
export type CredentialScope = "staff" | "portal";
export const myCredentialsKey = ["partner", "me", "credentials"] as const;

export function useMyPartnerCredentials() {
  const auth = useAuth();
  return useQuery({
    queryKey: myCredentialsKey,
    queryFn: fetchMyPartnerCredentials,
    enabled: live(auth),
    staleTime: 30_000,
    retry: false,
  });
}

export function useRevealCredential(scope: CredentialScope = "staff") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => (scope === "portal" ? revealMyPartnerCredential(id) : revealPartnerCredential(id)),
    onSuccess: (_value, id) => {
      void qc.invalidateQueries({ queryKey: credentialEventsKey(id) });
    },
  });
}

export function useSaveCredential(groupId: string | null, scope: CredentialScope = "staff") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCredentialInput) => (scope === "portal" ? saveMyPartnerCredential(input) : savePartnerCredential(input)),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: myCredentialsKey });
      if (groupId) {
        void qc.invalidateQueries({ queryKey: credentialsKey(groupId, false) });
        void qc.invalidateQueries({ queryKey: credentialsKey(groupId, true) });
      }
      void qc.invalidateQueries({ queryKey: credentialEventsKey(id) });
    },
  });
}

export function useArchiveCredential(groupId: string | null, scope: CredentialScope = "staff") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      (scope === "portal" ? archiveMyPartnerCredential(id, reason) : archivePartnerCredential(id, reason)),
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: myCredentialsKey });
      if (groupId) {
        void qc.invalidateQueries({ queryKey: credentialsKey(groupId, false) });
        void qc.invalidateQueries({ queryKey: credentialsKey(groupId, true) });
      }
      void qc.invalidateQueries({ queryKey: credentialEventsKey(id) });
    },
  });
}

/** The access record for one credential. Loaded only when somebody opens it. */
export function useCredentialEvents(credentialId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: credentialEventsKey(credentialId ?? ""),
    queryFn: () => fetchCredentialEvents(credentialId!),
    enabled: live(auth) && !!credentialId,
    staleTime: 15_000,
  });
}

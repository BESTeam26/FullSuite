/**
 * Canonical client reads, shared by query key.
 *
 * `["clients","directory",orgId]` serves the directory page and anything else
 * that needs the roster, so two components asking at once make one request
 * (rule 14). The profile has its own key because it carries fields the
 * directory deliberately does not fetch.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAgency } from "@/lib/agency-context";
import {
  fetchClientActivity,
  fetchClientDirectory,
  fetchClientDocuments,
  fetchClientProfile,
  updateClientIdentity,
  entityLinksFor,
  type ClientEntityLink,
  type ClientIdentityPatch,
} from "@/lib/data/clients";
import type { ClientDirectoryRow } from "@/lib/clients/client-directory-domain";

export function useClientDirectory() {
  const agency = useAgency();
  /* An organization view narrows to its own clients; the agency view does not
     narrow at all and lets RLS decide what staff may see. */
  const orgId = agency.viewMode === "subaccount" ? agency.activeOrganization?.id ?? null : null;
  return useQuery({
    queryKey: ["clients", "directory", orgId],
    queryFn: () => fetchClientDirectory(orgId),
    staleTime: 15_000,
  });
}

export function useClientProfile(clientId: string | undefined) {
  return useQuery({
    queryKey: ["clients", "profile", clientId],
    queryFn: () => fetchClientProfile(clientId as string),
    enabled: !!clientId,
    staleTime: 15_000,
  });
}

export function useUpdateClientIdentity(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ClientIdentityPatch) => updateClientIdentity(clientId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", "profile", clientId] });
      qc.invalidateQueries({ queryKey: ["clients", "directory"] });
    },
  });
}

/**
 * The client's history across every service they hold.
 *
 * Keyed by the engine links rather than the client id, so two profiles that
 * happen to share a credit case (they cannot, but the key should say why they
 * cannot) never collide, and so a profile with no services makes no request at
 * all.
 */
export type HistoryNeed = "overview" | "activity" | "documents" | "none";

export function useClientHistory(row: Pick<ClientDirectoryRow, "services"> | undefined, need: HistoryNeed) {
  const links: ClientEntityLink[] = row ? entityLinksFor(row) : [];
  const key = links.map((l) => `${l.entityType}:${l.entityId}`).sort().join("|");
  const activity = useQuery({
    queryKey: ["clients", "activity", key],
    queryFn: () => fetchClientActivity(links),
    /* Secondary data: fetched when the tab that shows it is open, never
       preloaded behind a closed tab (rule 14). The overview asks for it too,
       because the overview genuinely renders it. */
    enabled: links.length > 0 && (need === "activity" || need === "overview"),
    staleTime: 30_000,
  });
  const documents = useQuery({
    queryKey: ["clients", "documents", key],
    queryFn: () => fetchClientDocuments(links),
    enabled: links.length > 0 && need === "documents",
    staleTime: 30_000,
  });
  return { activity, documents, hasLinks: links.length > 0 };
}

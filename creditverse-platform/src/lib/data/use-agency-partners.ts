import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import type { PartnerHealth, PartnerLifecycle } from "@/lib/partners/partner-account";
import {
  createAgencyPartner, createPartnerContact, fetchAgencyPartner, fetchAgencyPartners,
  fetchPartnerClientCounts, fetchMyPartner, fetchMyPartnerClients, fetchMySharedFiles,
  fetchPartnerContacts, invitePartnerContact, setContactStatus, setPartnerHealth,
  setPartnerLifecycle, updateAgencyPartner, type NewPartner,
} from "@/lib/data/agency-partners";

export const partnersKey = (archived: boolean) => ["agency", "partners", archived] as const;
export const partnerKey = (id: string) => ["agency", "partner", id] as const;
export const partnerContactsKey = (id: string) => ["agency", "partner-contacts", id] as const;

function useLive() {
  const auth = useAuth();
  return { live: auth.mode === "live" && auth.status === "signed-in", agencyId: auth.agencyId ?? null };
}

export function useAgencyPartners(includeArchived = false) {
  const { live } = useLive();
  return useQuery({
    queryKey: partnersKey(includeArchived),
    queryFn: () => fetchAgencyPartners(includeArchived),
    enabled: live,
    staleTime: 60_000,
  });
}

export function useAgencyPartner(id: string | null) {
  const { live } = useLive();
  return useQuery({
    queryKey: partnerKey(id ?? ""),
    queryFn: () => fetchAgencyPartner(id!),
    enabled: live && !!id,
    staleTime: 60_000,
  });
}

export function usePartnerContacts(groupId: string | null) {
  const { live } = useLive();
  return useQuery({
    queryKey: partnerContactsKey(groupId ?? ""),
    queryFn: () => fetchPartnerContacts(groupId!),
    enabled: live && !!groupId,
    staleTime: 30_000,
  });
}

export function usePartnerActions() {
  const qc = useQueryClient();
  const { agencyId } = useLive();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["agency", "partners"] });
    void qc.invalidateQueries({ queryKey: ["agency", "partner"] });
  };
  return {
    create: useMutation({ mutationFn: (input: NewPartner) => createAgencyPartner(agencyId!, input), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { id: string; patch: Partial<NewPartner> }) => updateAgencyPartner(v.id, v.patch), onSuccess: refresh }),
    setLifecycle: useMutation({
      mutationFn: (v: { id: string; lifecycle: PartnerLifecycle }) => setPartnerLifecycle(v.id, v.lifecycle),
      onSuccess: refresh,
    }),
    setHealth: useMutation({
      mutationFn: (v: { id: string; health: PartnerHealth; note?: string }) => setPartnerHealth(v.id, v.health, v.note),
      onSuccess: refresh,
    }),
    addContact: useMutation({
      mutationFn: (v: { groupId: string; fullName: string; email: string; phone?: string; isPrimary?: boolean }) =>
        createPartnerContact({ agencyId: agencyId!, ...v }),
      onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: partnerContactsKey(v.groupId) }); },
    }),
    setContactStatus: useMutation({
      mutationFn: (v: { id: string; groupId: string; status: "active" | "suspended" | "archived" }) => setContactStatus(v.id, v.status),
      onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: partnerContactsKey(v.groupId) }); },
    }),
    inviteContact: useMutation({
      mutationFn: (v: { id: string; groupId: string }) => invitePartnerContact(v.id),
      onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: partnerContactsKey(v.groupId) }); },
    }),
  };
}

/** The partner a portal user belongs to. Null for everyone else. */
export function useMyPartner() {
  const { live } = useLive();
  return useQuery({
    queryKey: ["partner", "me"],
    queryFn: fetchMyPartner,
    enabled: live,
    staleTime: 300_000,
    retry: false,
  });
}

/**
 * Client counts for every partner at once.
 *
 * A separate hook with its OWN key so the two components that want it — the
 * partner list and a profile header — share one request rather than issuing
 * two (rule 14, "duplicate calls are collapsed by query key").
 */
export function usePartnerClientCounts() {
  const { live } = useLive();
  return useQuery({
    queryKey: ["agency", "partner-client-counts"],
    queryFn: fetchPartnerClientCounts,
    enabled: live,
    staleTime: 60_000,
  });
}

/**
 * The signed-in partner contact's own clients (portal only). The database
 * function is the gate; `includeClosed` widens to archived files on request
 * rather than shipping them to everyone who never asks (rule 14).
 */
export function useMyPartnerClients(includeClosed: boolean) {
  const { live } = useLive();
  return useQuery({
    queryKey: ["partner", "me", "clients", includeClosed],
    queryFn: () => fetchMyPartnerClients(includeClosed),
    enabled: live,
    staleTime: 60_000,
    retry: false,
  });
}

/** Files BES shared with the signed-in partner (RLS returns shared rows only). */
export function useMySharedFiles(groupId: string | null) {
  const { live } = useLive();
  return useQuery({
    queryKey: ["partner", "me", "files", groupId],
    queryFn: () => fetchMySharedFiles(groupId as string),
    enabled: live && !!groupId,
    staleTime: 60_000,
    retry: false,
  });
}

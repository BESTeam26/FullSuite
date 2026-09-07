import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createAgencyPartner, createPartnerContact, fetchAgencyPartner, fetchAgencyPartners,
  fetchMyPartner, fetchPartnerContacts, setContactStatus, setPartnerStatus,
  updateAgencyPartner, type NewPartner, type PartnerStatus,
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
    setStatus: useMutation({ mutationFn: (v: { id: string; status: PartnerStatus }) => setPartnerStatus(v.id, v.status), onSuccess: refresh }),
    addContact: useMutation({
      mutationFn: (v: { groupId: string; fullName: string; email: string; phone?: string; isPrimary?: boolean }) =>
        createPartnerContact({ agencyId: agencyId!, ...v }),
      onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: partnerContactsKey(v.groupId) }); },
    }),
    setContactStatus: useMutation({
      mutationFn: (v: { id: string; groupId: string; status: "active" | "suspended" | "archived" }) => setContactStatus(v.id, v.status),
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

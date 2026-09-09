/**
 * Company documents for the organization in view: one list, upload and
 * remove, and a signed link created only when someone actually opens a file.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  deleteCompanyDocument,
  fetchCompanyDocuments,
  uploadCompanyDocument,
  type CompanyDocument,
} from "@/lib/data/company-documents";

export const companyDocumentsKey = (orgId: string | null) => ["hub", "documents", orgId] as const;

/**
 * `organizationId` null means BES'S OWN hub (rule 18: same engine, two
 * owners), so a caller that has not resolved its tenancy yet must gate with
 * `enabled` rather than passing null to mean "not ready".
 */
export function useCompanyDocuments(organizationId: string | null, enabled: boolean) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: companyDocumentsKey(organizationId),
    queryFn: () => fetchCompanyDocuments(organizationId),
    enabled: live && enabled,
    staleTime: 60_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: companyDocumentsKey(organizationId) });
  return {
    documents: q.data ?? [],
    isLoading: live && enabled && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    upload: useMutation({
      mutationFn: (file: File) =>
        uploadCompanyDocument({ organizationId, file }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (doc: CompanyDocument) => deleteCompanyDocument(doc), onSuccess: refresh }),
  };
}

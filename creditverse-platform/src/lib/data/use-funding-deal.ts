/**
 * One deal, and the two writes that change its requirements.
 *
 * Its own key, because a deal page needs fields the file reader deliberately
 * does not fetch (the fit criteria, the funded record, the stipulations).
 * Invalidating the deal also invalidates its file, because a stipulation
 * moving changes the file's outstanding count.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDealStipulation,
  fetchDealDetail,
  moveDocumentRequest,
} from "@/lib/data/funding-domain";
import type { Enums } from "@/lib/supabase/database.types";

export function useDealDetail(dealId: string | undefined) {
  return useQuery({
    queryKey: ["funding", "deal", dealId],
    queryFn: () => fetchDealDetail(dealId as string),
    enabled: !!dealId,
    staleTime: 15_000,
  });
}

export function useDealWrites(dealId: string, fileId: string | undefined) {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: ["funding", "deal", dealId] });
    if (fileId) void qc.invalidateQueries({ queryKey: ["funding-file", fileId] });
  };
  const addStipulation = useMutation({
    mutationFn: (input: { documentType: string; lenderNote?: string | null; period?: string | null }) =>
      addDealStipulation({ dealId, ...input }),
    onSuccess: settle,
  });
  const moveRequest = useMutation({
    mutationFn: (input: { requestId: string; status: Enums<"document_request_status">; note?: string }) =>
      moveDocumentRequest(input.requestId, input.status, input.note),
    onSuccess: settle,
  });
  return { addStipulation, moveRequest };
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { advanceDiy } from "@/lib/data/diy";
import type { DiyStage } from "@/lib/diy/journey";

/**
 * Moving the journey on.
 *
 * There is deliberately no read hook here. The journey arrives with
 * `client_portal_home()` in the same request as everything else the first
 * screen needs — fetching it separately meant waiting for the client id and
 * then asking again, which is the waterfall rule 14 exists to prevent.
 */
export function useAdvanceDiy(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: DiyStage) => advanceDiy(clientId!, stage),
    /* The stage lives on the portal home now, so that is what must refresh. */
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["portal", "home"] }); },
  });
}

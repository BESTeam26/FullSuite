/**
 * Sales & Marketing — cached reads.
 *
 * One key per question, shared by every screen that asks it. The dashboard,
 * the task list and the calendar of a given scope read ONE `marketing_work`
 * query between them, because they are three renderings of the same rows and
 * three requests for one answer is the waterfall rule 14 exists to prevent.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCampaign, createMarketingWork, fetchCampaigns, fetchMarketingApprovals,
  fetchMarketingCounters, fetchMarketingPartners, fetchMarketingWork,
  requestPartnerApproval, setWorkCampaign, updateCampaign,
  type CampaignInput, type NewMarketingWork,
} from "@/lib/data/marketing";
import { fetchMarketingWorkspaces } from "@/lib/data/workspaces";

export const marketingKeys = {
  all: ["marketing"] as const,
  partners: ["marketing", "partners"] as const,
  workspaces: ["marketing", "workspaces"] as const,
  counters: ["marketing", "counters"] as const,
  approvals: ["marketing", "approvals"] as const,
  work: (workspaceId: string | null) => ["marketing", "work", workspaceId] as const,
  campaigns: (workspaceId: string | null) => ["marketing", "campaigns", workspaceId] as const,
};

const MINUTE = 60_000;

export const useMarketingPartners = () =>
  useQuery({ queryKey: marketingKeys.partners, queryFn: fetchMarketingPartners, staleTime: 5 * MINUTE });

export const useMarketingWorkspaces = () =>
  useQuery({ queryKey: marketingKeys.workspaces, queryFn: fetchMarketingWorkspaces, staleTime: 5 * MINUTE });

/** `null` means every marketing workspace the caller may see — the global views. */
export const useMarketingWork = (workspaceId: string | null) =>
  useQuery({
    queryKey: marketingKeys.work(workspaceId),
    queryFn: () => fetchMarketingWork(workspaceId),
    staleTime: MINUTE,
  });

export const useMarketingCounters = () =>
  useQuery({ queryKey: marketingKeys.counters, queryFn: fetchMarketingCounters, staleTime: MINUTE });

export const useCampaigns = (workspaceId: string | null) =>
  useQuery({
    queryKey: marketingKeys.campaigns(workspaceId),
    queryFn: () => fetchCampaigns(workspaceId),
    staleTime: 2 * MINUTE,
  });

export const useMarketingApprovals = () =>
  useQuery({ queryKey: marketingKeys.approvals, queryFn: fetchMarketingApprovals, staleTime: MINUTE });

/**
 * Every write invalidates the whole module.
 *
 * Deliberate: creating a task changes the task list, the calendar if it has a
 * publish date, the dashboard counters, and a campaign's progress. Invalidating
 * precisely would mean keeping that list of consequences in step by hand, and
 * the module's reads are small and bounded.
 */
const useMarketingMutation = <TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
};

export const useCreateMarketingWork = () =>
  useMarketingMutation((input: NewMarketingWork) => createMarketingWork(input));

export const useSetWorkCampaign = () =>
  useMarketingMutation(({ itemId, campaignId }: { itemId: string; campaignId: string | null }) =>
    setWorkCampaign(itemId, campaignId));

export const useCreateCampaign = () =>
  useMarketingMutation((input: CampaignInput) => createCampaign(input));

export const useUpdateCampaign = () =>
  useMarketingMutation(({ id, patch }: { id: string; patch: Parameters<typeof updateCampaign>[1] }) =>
    updateCampaign(id, patch));

export const useRequestPartnerApproval = () =>
  useMarketingMutation(({ workItemId, kind, title, detail }: {
    workItemId: string;
    kind?: "content_approval" | "campaign_approval";
    title?: string | null;
    detail?: string | null;
  }) => requestPartnerApproval(workItemId, kind, title, detail));

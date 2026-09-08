/**
 * Organization-wide search — inline in the Topbar, no modal. Results appear
 * under the field as you type and cover everything the organization holds:
 * CreditOps clients, FundingOps clients and deals, work items (workspace and
 * module work), workspaces, team members and files. In agency view it also
 * finds organizations.
 *
 * Every source is the SAME cached query the screens use (identical keys), so
 * nothing is fetched twice, and each source is requested only while the field
 * has a query and only for what the viewer is entitled to. Rows come back
 * RLS-scoped; the organization id only narrows client-side. Matching is
 * client-side over those bounded lists — a server-side search function is the
 * next step if an organization outgrows them (rule 14, recorded).
 *
 * CONVERSATIONS ARE THE ONE EXCEPTION, and deliberately so. Messages are not
 * a bounded list a screen already holds, and they must never be filtered on
 * this side, so they go through `search_messages` — SECURITY INVOKER and
 * narrowed to `channel_visible`, which means it can only ever return LESS
 * than the conversation list, never more (Dee, §24). That makes it a server
 * call, so it is debounced and needs two characters: one request when typing
 * settles, not one per keystroke (rule 14).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  FileText,
  Landmark,
  LayoutGrid,
  MessageSquare,
  ListTodo,
  Paperclip,
  Search,
  Users,
  X,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchFulfillmentClients } from "@/lib/data/fulfillment-clients";
import { fetchAllFundingDeals, fetchFundingClients } from "@/lib/data/funding-clients";
import { fetchOrganizationWork } from "@/lib/data/work-items";
import { fetchAllWorkspaceItems, fetchAssignableOrgMembers } from "@/lib/data/workspaces";
import { fetchOrganizationFiles } from "@/lib/data/activity-attachments";
import { searchMessages } from "@/lib/data/channels";
import { useWorkspaces } from "@/lib/data/use-workspaces";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

const MAX_PER_GROUP = 6;

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const agency = useAgency();
  const auth = useAuth();
  const [query, setQuery] = useState("");
  /* Results show whenever there is a query and the person has not dismissed
     them (Escape, clear, outside click, or picking a result). Typing again
     un-dismisses. Not tied to focus, so a click into the results never hides
     them. */
  const [dismissed, setDismissed] = useState(false);
  const setFocused = (visible: boolean) => setDismissed(!visible);
  const changeQuery = (next: string) => {
    setQuery(next);
    setDismissed(false);
  };
  const rootRef = useRef<HTMLDivElement>(null);

  const live = auth.mode === "live" && auth.status === "signed-in";
  const isAgencyView = agency.viewMode === "agency";
  const org = agency.activeOrganization;
  const orgId = !isAgencyView && org ? org.id : null;
  const q = query.trim().toLowerCase();
  const active = live && q.length > 0;
  const creditOn = isAgencyView || agency.isProductOn("creditOps");
  const fundingOn = isAgencyView || agency.isProductOn("fundingOps");
  const workspacesOn = !!orgId && agency.isProductOn("workspaces");

  /* Sources — same keys as the screens. */
  const credit = useQuery({ queryKey: ["creditops", "clients"], queryFn: fetchFulfillmentClients, enabled: active && creditOn, staleTime: 15_000 });
  const funding = useQuery({ queryKey: ["fundingops", "clients"], queryFn: fetchFundingClients, enabled: active && fundingOn, staleTime: 15_000 });
  const deals = useQuery({ queryKey: ["funding", "deals", "all"], queryFn: fetchAllFundingDeals, enabled: active && fundingOn, staleTime: 15_000 });
  const work = useQuery({ queryKey: ["work", "organization", orgId], queryFn: () => fetchOrganizationWork(orgId as string), enabled: active && !!orgId, staleTime: 15_000 });
  const wsItems = useQuery({ queryKey: ["workspaces", "items", "all"], queryFn: fetchAllWorkspaceItems, enabled: active && workspacesOn, staleTime: 15_000 });
  const members = useQuery({ queryKey: ["org-members", orgId], queryFn: () => fetchAssignableOrgMembers(orgId as string), enabled: active && !!orgId, staleTime: 60_000 });
  const files = useQuery({ queryKey: ["files", "organization", orgId], queryFn: () => fetchOrganizationFiles(orgId as string), enabled: active && !!orgId, staleTime: 30_000 });
  const { workspaces } = useWorkspaces(active && workspacesOn ? orgId : null);

  /* Conversations: one server call when typing settles. `search_messages`
     needs two characters and answers under the caller's own policies. */
  const settled = useDebounced(q, 300);
  const messages = useQuery({
    queryKey: ["messages", "search", settled],
    queryFn: () => searchMessages(settled, MAX_PER_GROUP),
    enabled: live && settled.length >= 2,
    staleTime: 15_000,
  });

  const matches = (...fields: (string | number | undefined | null)[]) =>
    fields.some((f) => f !== undefined && f !== null && String(f).toLowerCase().includes(q));
  const inScope = (organizationId: string | undefined | null) => isAgencyView || organizationId === orgId;

  const organizations = useMemo(
    () => (isAgencyView && q ? agency.organizations.filter((o) => matches(o.name, o.publicId, o.principal.name, o.principal.email)).slice(0, MAX_PER_GROUP) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAgencyView, agency.organizations, q],
  );
  const creditClients = q ? (credit.data ?? []).filter((c) => inScope(c.organizationId) && matches(c.name, c.email, c.phone, c.status)).slice(0, MAX_PER_GROUP) : [];
  const fundingClients = q ? (funding.data ?? []).filter((c) => inScope(c.organizationId) && matches(c.name, c.email, c.status)).slice(0, MAX_PER_GROUP) : [];
  const fundingClientIds = new Set((funding.data ?? []).filter((c) => inScope(c.organizationId)).map((c) => c.id));
  const dealHits = q ? (deals.data ?? []).filter((d) => fundingClientIds.has(d.clientId) && matches(d.lender, d.status, d.amount, d.id)).slice(0, MAX_PER_GROUP) : [];
  const workHits = q ? (work.data ?? []).filter((w) => matches(w.title, w.stage)).slice(0, MAX_PER_GROUP) : [];
  const workspaceIds = new Set(workspaces.map((w) => w.id));
  const wsItemHits = q ? (wsItems.data ?? []).filter((i) => workspaceIds.has(i.workspaceId) && matches(i.title)).slice(0, MAX_PER_GROUP) : [];
  const workspaceHits = q ? workspaces.filter((w) => matches(w.name)).slice(0, MAX_PER_GROUP) : [];
  const memberHits = q ? (members.data ?? []).filter((m) => matches(m.name, m.email, m.role)).slice(0, MAX_PER_GROUP) : [];
  const fileHits = q ? (files.data ?? []).filter((f) => matches(f.name)).slice(0, MAX_PER_GROUP) : [];
  /* Not filtered here. There is nothing to filter: the function already
     answered for this person. */
  const messageHits = q ? (messages.data ?? []) : [];

  const total =
    organizations.length + creditClients.length + fundingClients.length + dealHits.length +
    workHits.length + wsItemHits.length + workspaceHits.length + memberHits.length + fileHits.length +
    messageHits.length;
  const loading = [credit, funding, deals, work, wsItems, members, files, messages].some((s) => s.isLoading);
  const open = !dismissed && q.length > 0;

  /* Close when the pointer lands outside the field and its results. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const go = (path: string) => {
    setFocused(false);
    setQuery("");
    navigate(path);
  };
  const creditPath = (id: string) => (isAgencyView ? `/app/creditops?client=${id}` : `/app/operations?client=${id}`);
  const fundingPath = (id: string) => (isAgencyView ? `/app/fundingops?client=${id}` : `/app/funding-workspace?client=${id}`);
  const filePath = (entityType: string | null, entityId: string | null) => {
    if (!entityId) return null;
    if (entityType === "fulfillment_client") return creditPath(entityId);
    if (entityType === "funding_client") return fundingPath(entityId);
    return null;
  };

  const item = (key: string, icon: React.ReactNode, label: string, meta: string | undefined, onSelect: () => void) => (
    <CommandItem key={key} value={key} onSelect={onSelect} className="gap-2">
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {meta && <span className="max-w-[40%] truncate text-xs text-muted-foreground">{meta}</span>}
    </CommandItem>
  );
  const icon = (I: typeof Search) => <I className="h-4 w-4 shrink-0 text-muted-foreground" />;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Command shouldFilter={false} className="overflow-visible bg-transparent">
        <div className="relative">
          <CommandInput
            value={query}
            onValueChange={changeQuery}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setQuery(""); setFocused(false); (e.target as HTMLInputElement).blur(); }
            }}
            placeholder={isAgencyView ? "Search organizations, clients…" : `Search ${org?.name ?? "this organization"}…`}
            aria-label="Search"
            className="h-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setFocused(false); }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {open && (
          <CommandList className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] rounded-xl border border-border bg-card p-1 shadow-xl">
            {total === 0 && <CommandEmpty>{loading ? "Searching…" : "No matches in this organization."}</CommandEmpty>}
            {organizations.length > 0 && (
              <CommandGroup heading="Organizations">
                {organizations.map((o) => item(`org-${o.id}`, icon(Building2), o.name, o.publicId, () => { setFocused(false); setQuery(""); agency.switchToSubAccount(o.id); }))}
              </CommandGroup>
            )}
            {creditClients.length > 0 && (
              <CommandGroup heading="CreditOps clients">
                {creditClients.map((c) => item(`credit-${c.id}`, icon(FileText), c.name, c.status, () => go(creditPath(c.id))))}
              </CommandGroup>
            )}
            {fundingClients.length > 0 && (
              <CommandGroup heading="FundingOps clients">
                {fundingClients.map((c) => item(`funding-${c.id}`, icon(Landmark), c.name, c.status, () => go(fundingPath(c.id))))}
              </CommandGroup>
            )}
            {dealHits.length > 0 && (
              <CommandGroup heading="Deals">
                {dealHits.map((d) => item(`deal-${d.id}`, icon(Landmark), `${d.lender} · $${d.amount.toLocaleString()}`, d.status, () => go(fundingPath(d.clientId))))}
              </CommandGroup>
            )}
            {(workHits.length > 0 || wsItemHits.length > 0) && (
              <CommandGroup heading="Work items">
                {workHits.map((w) => item(`work-${w.id}`, icon(ListTodo), w.title, w.stage, () => go("/app/my-work")))}
                {wsItemHits.map((i) => item(`wsitem-${i.id}`, icon(ListTodo), i.title, workspaces.find((w) => w.id === i.workspaceId)?.name, () => go(`/app/workspaces?workspace=${i.workspaceId}&item=${i.id}`)))}
              </CommandGroup>
            )}
            {workspaceHits.length > 0 && (
              <CommandGroup heading="Workspaces">
                {workspaceHits.map((w) => item(`ws-${w.id}`, icon(LayoutGrid), w.name, undefined, () => go(`/app/workspaces?workspace=${w.id}`)))}
              </CommandGroup>
            )}
            {memberHits.length > 0 && (
              <CommandGroup heading="Team">
                {memberHits.map((m) => item(`member-${m.id}`, icon(Users), m.name, m.role, () => go("/app/teams")))}
              </CommandGroup>
            )}
            {messageHits.length > 0 && (
              <CommandGroup heading="Conversations">
                {messageHits.map((m) =>
                  item(
                    `msg-${m.messageId}`,
                    icon(MessageSquare),
                    m.bodyText,
                    `${m.channelName} · ${m.authorName}`,
                    () => go(`/app/channels?channel=${m.channelId}`),
                  ),
                )}
              </CommandGroup>
            )}
            {fileHits.length > 0 && (
              <CommandGroup heading="Files">
                {fileHits.map((f) => {
                  const path = filePath(f.entityType, f.entityId);
                  return item(`file-${f.id}`, icon(Paperclip), f.name, path ? undefined : "attached to a record", () => { if (path) go(path); });
                })}
              </CommandGroup>
            )}
          </CommandList>
        )}
      </Command>
    </div>
  );
}

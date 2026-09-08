/**
 * The banner, and the picker that starts a preview.
 *
 * Dee, §36: "Persistent banner: PREVIEWING AS [Name] [Role] READ ONLY / Exit
 * Preview. Never make preview subtle."
 *
 * So it is a full-width amber bar above everything, it names the person and
 * their role, it says READ ONLY, and Exit is the largest thing on it. A
 * preview somebody forgets they are in is how a screenshot of the wrong
 * person's data gets sent to a partner.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Eye, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useViewAs } from "@/lib/agency/view-as-context";
import { fetchPreviewCandidates } from "@/lib/data/view-as";
import { rankMentionCandidates } from "@/lib/activity/mentions";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  agency_owner: "Owner",
  agency_admin: "Administrator",
  agency_manager: "Manager",
  agency_team_lead: "Team lead",
  agency_agent: "Agent",
};

/** The bar. Rendered above the whole shell while a preview is active. */
export function ViewAsBanner() {
  const { previewing, access, exit, loading } = useViewAs();
  if (!previewing && !loading) return null;

  return (
    <div role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-amber-500 bg-amber-500/15 px-4 py-2">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      {loading && !access ? (
        <span className="text-xs font-semibold text-amber-900">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading their access…
        </span>
      ) : (
        <>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
            Previewing as
          </span>
          <span className="text-sm font-bold text-amber-950">{access?.profile.name}</span>
          <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-900">
            {ROLE_LABEL[access?.profile.role ?? ""] ?? access?.profile.role ?? "no role"}
          </span>
          {access?.profile.status !== "active" && (
            <span className="rounded-full bg-status-danger/15 px-2 py-0.5 text-[10px] font-bold text-status-danger">
              {access?.profile.status}
            </span>
          )}
          <span className="rounded-full border border-amber-600/40 px-2 py-0.5 text-[10px] font-bold text-amber-900">
            READ ONLY
          </span>
        </>
      )}
      <Button size="sm" variant="outline" className="ml-auto border-amber-600/50 bg-card"
        onClick={exit}>
        <X className="mr-1 h-3.5 w-3.5" /> Exit preview
      </Button>
    </div>
  );
}

/** The control that starts one. Lives in the top bar, for a previewer only. */
export function ViewAsPicker() {
  const { canPreview, previewing, start } = useViewAs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const candidates = useQuery({
    queryKey: ["view-as", "candidates"],
    queryFn: fetchPreviewCandidates,
    enabled: open,
    staleTime: 300_000,
  });

  if (!canPreview || previewing) return null;

  const matches = rankMentionCandidates(
    (candidates.data ?? []).map((c) => ({ ...c, userId: c.userId })),
    query,
    8,
  );

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Eye className="h-3.5 w-3.5 text-primary" /> View as
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-card p-2 shadow-lg">
          <p className="mb-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
            See exactly what somebody else sees. Read-only — nothing you do while previewing
            happens as them.
          </p>
          <Input className="mb-1.5 h-8" value={query} autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the team" aria-label="Search the team" />
          {candidates.isLoading ? (
            <p className="px-1 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>
          ) : matches.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Nobody matches.</p>
          ) : (
            <ul className="space-y-0.5">
              {matches.map((c) => (
                <li key={c.userId}>
                  <button type="button"
                    onClick={() => { start(c.userId); setOpen(false); setQuery(""); }}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{c.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{c.email}</span>
                    </span>
                    <span className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      c.status === "active" ? "bg-muted text-muted-foreground"
                                            : "bg-status-danger/10 text-status-danger",
                    )}>
                      {ROLE_LABEL[c.role] ?? c.role}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

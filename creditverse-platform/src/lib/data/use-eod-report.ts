/**
 * The EOD report document — read from the row when it exists, built live
 * only when it does not.
 *
 * Dee, 2026-09-29: "EOD generation should happen efficiently in the
 * background/on submission and must NOT add latency to the live CreditOps
 * workflow."
 *
 * So the order of preference is fixed:
 *
 *   1. The stored document on the submission (`eod_submissions.report`),
 *      built once when the lead pressed Submit. A row fetch. This is what the
 *      email was rendered from, so what the lead sees here is what their
 *      manager received — by construction, not by coincidence.
 *   2. Only when no submission exists for the day: a live `eod_report` build,
 *      so a lead can see "what my report looks like so far" before filing.
 *      Bounded to the scope they lead; never called anywhere else.
 *
 * Nothing here computes a number. Every figure in the document was summed in
 * the database from production_logs.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export type EodReportLevel = "team" | "department" | "division" | "agency";

export interface EodReportCategory { key: string; label: string; position: number }

export interface EodReportRow {
  id: string;
  name: string;
  /** Job title at team level; "Team" / "Department" / "Division" above it. */
  role: string | null;
  /** Team level: did this person file. Above it: how many in the unit did. */
  submitted?: boolean | number;
  auto_submitted?: boolean;
  state?: string;
  submitted_at?: string | null;
  /** Units per category key. Absent key means zero that day. */
  categories: Record<string, number>;
  total: number;
  /** Above team level: how many people the unit holds, and how many filed. */
  members?: number;
  notes?: string | null;
  blockers?: string | null;
  help_needed?: string | null;
  handoff?: string | null;
}

export interface EodReportGroup {
  key: string;
  label: string;
  position: number;
  lines: { name: string; units: number }[];
  total: number;
}

export interface EodReportDoc {
  level: EodReportLevel;
  work_date: string;
  timezone: string;
  scope: { id: string; name: string; service: string | null };
  lead: { id: string | null; name: string | null };
  categories: EodReportCategory[];
  rows: EodReportRow[];
  groups: EodReportGroup[];
  totals: {
    categories: Record<string, number>;
    total: number;
    members: number;
    submitted: number;
    not_submitted: number;
  };
  attention: { name: string; unit: string | null; blockers: string | null; help_needed: string | null }[];
  /** One level down, for drill-down. Empty at team level. */
  children: EodReportDoc[];
  built_at: string;
}

export interface MyEodReport {
  /** Null when this person leads nothing — there is no rollup to show. */
  doc: EodReportDoc | null;
  level: EodReportLevel | null;
  /** True when `doc` came from the submitted row; false when built live. */
  stored: boolean;
  submittedAt: string | null;
  /** Why the stored build failed, if it did. The submission still went through. */
  error: string | null;
  /** Where this person's submission is sent, and why. */
  routing: { reason: string | null; toName: string | null };
}

export const myEodReportKey = (userId: string, date: string) =>
  ["eod", "report", "mine", userId, date] as const;

export function useMyEodReport(date: string) {
  const { user, mode, status } = useAuth();
  const userId = user?.id ?? "";
  return useQuery({
    queryKey: myEodReportKey(userId, date),
    enabled: mode === "live" && status === "signed-in" && !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<MyEodReport> => {
      const sb = requireSupabase();

      /* 1. The stored document. The generated types do not know the four new
            columns yet; this reads them by name and narrows by hand rather
            than regenerating types for one hook. */
      const { data: row, error: rowErr } = await sb
        .from("eod_submissions")
        .select("submitted_at, report, report_level, report_scope_id, report_error, routing_reason, routed_to")
        .eq("employee_id", userId)
        .eq("work_date", date)
        .maybeSingle();
      if (rowErr) throw rowErr;
      const r = (row ?? null) as unknown as Record<string, unknown> | null;

      /* Who it goes to, for the "Submit to …" line. */
      const { data: route } = await sb.rpc("eod_route_up_for", { p_employee: userId });
      const routeRow = (Array.isArray(route) ? route[0] : route) as Record<string, unknown> | undefined;
      let toName: string | null = null;
      if (routeRow?.lead_id) {
        const { data: p } = await sb.from("profiles").select("full_name, email")
          .eq("id", String(routeRow.lead_id)).maybeSingle();
        toName = (p?.full_name as string) || (p?.email as string) || null;
      }
      const routing = { reason: (r?.routing_reason as string) ?? (routeRow?.reason as string) ?? null, toName };
      const level = ((r?.report_level as string) ?? (routeRow?.level as string) ?? null) as EodReportLevel | null;

      if (r?.report) {
        return { doc: r.report as EodReportDoc, level, stored: true,
          submittedAt: (r.submitted_at as string) ?? null,
          error: (r.report_error as string) ?? null, routing };
      }

      /* 2. Nothing stored: leads nothing, or has not filed yet. Build live
            only for somebody who leads a scope. */
      if (!level || !routeRow?.scope_id) {
        return { doc: null, level: null, stored: false,
          submittedAt: (r?.submitted_at as string) ?? null,
          error: (r?.report_error as string) ?? null, routing };
      }
      const { data: doc, error: docErr } = await sb.rpc("eod_report", {
        p_level: level, p_scope_id: String(routeRow.scope_id), p_date: date,
      });
      if (docErr) throw docErr;
      return { doc: doc as unknown as EodReportDoc, level, stored: false,
        submittedAt: (r?.submitted_at as string) ?? null,
        error: (r?.report_error as string) ?? null, routing };
    },
  });
}

/**
 * A manager opening a scope they may see, on demand. Children are embedded
 * in the document, so drill-down never fetches again — this is for choosing a
 * DIFFERENT scope, not for expanding one.
 */
export function useEodReport(level: EodReportLevel | null, scopeId: string | null, date: string) {
  const { mode, status } = useAuth();
  return useQuery({
    queryKey: ["eod", "report", level ?? "", scopeId ?? "", date] as const,
    enabled: mode === "live" && status === "signed-in" && !!level && !!scopeId,
    staleTime: 60_000,
    queryFn: async (): Promise<EodReportDoc> => {
      const { data, error } = await requireSupabase().rpc("eod_report", {
        p_level: level as string, p_scope_id: scopeId as string, p_date: date,
      });
      if (error) throw error;
      return data as unknown as EodReportDoc;
    },
  });
}

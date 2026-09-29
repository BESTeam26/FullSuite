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
 *   1. The stored documents on the submission (`eod_submissions.report`),
 *      built once when the lead pressed Submit. This is what the email was
 *      rendered from, so what the lead sees here is what their manager
 *      received — by construction, not by coincidence.
 *   2. Only when no submission exists for the day: a live `eod_report` build,
 *      so a lead can see "what my report looks like so far" before filing.
 *      Bounded to the scopes they lead; never called anywhere else.
 *
 * That preference is written ONCE, in `eod_my_report`, and the browser makes
 * one request for it (rule 14). A person seated on two scopes — Rowell over
 * CreditOps and BES CRM, Daniel over two departments — gets one document per
 * scope, each built by the same `eod_report`; nothing is summed twice.
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
  /** One document per scope this person leads. Empty for somebody who leads nothing. */
  docs: EodReportDoc[];
  level: EodReportLevel | null;
  /** True when `docs` came from the submitted row; false when built live. */
  stored: boolean;
  submittedAt: string | null;
  /** Why a stored build failed, if it did. The submission still went through. */
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
      const { data, error } = await requireSupabase().rpc("eod_my_report", { p_date: date });
      if (error) throw error;
      const r = (data ?? {}) as Record<string, unknown>;
      const routing = (r.routing ?? {}) as Record<string, unknown>;
      return {
        docs: Array.isArray(r.documents) ? (r.documents as EodReportDoc[]) : [],
        level: (r.level as EodReportLevel | null) ?? null,
        stored: r.stored === true,
        submittedAt: (r.submitted_at as string | null) ?? null,
        error: (r.error as string | null) ?? null,
        routing: {
          reason: (routing.reason as string | null) ?? null,
          toName: (routing.lead_name as string | null) ?? null,
        },
      };
    },
  });
}

/**
 * A report somebody filed TO this person: a division manager reads the
 * department reports addressed to them, an executive the division reports.
 * Read exactly as stored — the same documents the sender's email carried.
 */
export interface EodRoutedReport {
  eodId: string;
  employeeId: string;
  employeeName: string;
  level: EodReportLevel;
  docs: EodReportDoc[];
  submittedAt: string;
  error: string | null;
}

export const eodRoutedToMeKey = (userId: string, date: string) =>
  ["eod", "report", "routed-to-me", userId, date] as const;

export function useEodReportsRoutedToMe(date: string) {
  const { user, mode, status } = useAuth();
  const userId = user?.id ?? "";
  return useQuery({
    queryKey: eodRoutedToMeKey(userId, date),
    enabled: mode === "live" && status === "signed-in" && !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<EodRoutedReport[]> => {
      const { data, error } = await requireSupabase().rpc("eod_reports_routed_to_me", { p_date: date });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        eodId: String(r.eod_id),
        employeeId: String(r.employee_id),
        employeeName: String(r.employee_name ?? ""),
        level: String(r.report_level) as EodReportLevel,
        docs: Array.isArray(r.documents) ? (r.documents as EodReportDoc[]) : [],
        submittedAt: String(r.submitted_at),
        error: (r.report_error as string | null) ?? null,
      }));
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

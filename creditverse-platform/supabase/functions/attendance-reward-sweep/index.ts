/**
 * The quarter-close reward sweep.
 *
 * ---------------------------------------------------------------------------
 * NOT A SECOND SCORING ENGINE.
 *
 * Dee, 2026-09-19: "Do not duplicate the attendance scoring logic in SQL. Build
 * the quarter-close reward evaluator as an Edge Function that imports and uses
 * the SAME canonical attendance scoring engine already used by the
 * application."
 *
 * Every rule here is imported from `src/lib/attendance/` — the same files the
 * browser bundles. This function is I/O glue: load the rows, hand them to
 * `evaluateQuarter`, act on each outcome. If the engine changes, this changes
 * with it, because there is nothing here to change.
 * ---------------------------------------------------------------------------
 *
 * ── SCHEDULE ───────────────────────────────────────────────────────────────
 *
 * Called once a day by `attendance_reward_dispatch()` (pg_cron → pg_net). The
 * FUNCTION decides whether anything closes — Dee: "safer than relying on a
 * cron expression that only works on quarter-end dates." On the 364 days a
 * year with nothing to do it returns quickly having done nothing.
 *
 * ── REPLAY ─────────────────────────────────────────────────────────────────
 *
 * Safe three ways: the decision is deterministic, anyone already rewarded is
 * skipped before scoring, and the unique index on (user, kind, quarter) makes
 * a racing grant a no-op rather than a duplicate.
 *
 * ── AUTHENTICATION ─────────────────────────────────────────────────────────
 *
 * A shared secret from the Vault, compared in constant time. No user session
 * is involved and none is accepted — `auth.uid()` is null inside every call,
 * which is what `attendance_for` and `grant_attendance_reward` read as "the
 * system itself". Deployed with --no-verify-jwt for the same reason the email
 * sweeps are.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { factsFrom } from "../../../src/lib/attendance/attendance-facts.ts";
import { mapPolicy } from "../../../src/lib/attendance/attendance-policy-map.ts";
import { latestPerDay } from "../../../src/lib/attendance/corrections-latest.ts";
import {
  closedQuarterFor, evaluateQuarter, isClosed, quarterBounds,
} from "../../../src/lib/attendance/reward-sweep.ts";
import { pageAll } from "../../../src/lib/attendance/page-all.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Constant-time equality: a `!==` on a secret leaks its prefix by timing. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Today in the agency's own calendar — the same clock every other rule uses. */
const businessToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());

Deno.serve(async (req) => {
  const expected = Deno.env.get("ATTENDANCE_REWARD_SECRET") ?? "";
  const given = req.headers.get("x-dispatch-secret") ?? "";
  if (!expected || !sameSecret(given, expected)) return json(401, { error: "unauthorized" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = businessToday();
  const quarter = closedQuarterFor(today);
  if (!isClosed(quarter, today)) return json(200, { quarter, closed: false, granted: 0 });

  const { from, to } = quarterBounds(quarter);

  /* Everything the engine needs, in parallel — one round trip each, not one
     per person (rule 14 applies to jobs too). */
  const [members, attendance, schedules, corrections, policies, existing] = await Promise.all([
    sb.from("agency_memberships")
      .select("user_id, agency_id, status, attendance_reward_eligible, profiles!user_id!inner(is_fixture)")
      .eq("profiles.is_fixture", false),
    /* Paged: PostgREST caps a response at 1,000 rows and says nothing; a
       quarter for the whole team is more than that. Wrapped so it joins the
       Promise.all with the same {data,error} shape. */
    pageAll((offset, limit) =>
      sb.rpc("attendance_for", { p_from: from, p_to: to })
        .order("user_id").order("day").range(offset, offset + limit - 1)
        .then(({ data, error }) => { if (error) throw error; return (data ?? []) as Record<string, unknown>[]; }))
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((e: Error) => ({ data: null, error: { message: e.message } })),
    sb.from("work_schedules").select("user_id, shift_start, shift_end, lunch_minutes, effective_from")
      .order("effective_from", { ascending: false }),
    sb.from("attendance_corrections")
      .select("user_id, work_date, classification, reason, decided_at, profiles!attendance_corrections_decided_by_fkey(full_name, email)")
      .gte("work_date", from).lte("work_date", to).order("decided_at"),
    sb.from("attendance_policy").select("*"),
    sb.from("reward_credits").select("user_id").eq("kind", "attendance").eq("source_quarter", quarter),
  ]);
  for (const r of [members, attendance, schedules, corrections, policies, existing]) {
    if (r.error) return json(500, { error: r.error.message });
  }

  const rewarded = new Set((existing.data ?? []).map((r) => r.user_id as string));
  const policyByAgency = new Map(
    (policies.data ?? []).map((p) => [p.agency_id as string, mapPolicy(p as Record<string, unknown>)]),
  );
  /* Latest schedule per person is the one in force. */
  const scheduleOf = new Map<string, { shiftStart: string; shiftEnd: string; lunchMinutes: number }>();
  for (const s of schedules.data ?? []) {
    if (!scheduleOf.has(s.user_id)) {
      scheduleOf.set(s.user_id, { shiftStart: s.shift_start, shiftEnd: s.shift_end, lunchMinutes: s.lunch_minutes ?? 0 });
    }
  }
  const days = (attendance.data ?? []).map((d: Record<string, unknown>) => ({
    userId: d.user_id as string, day: d.day as string, onLeave: d.on_leave === true,
    workMinutes: Number(d.work_minutes ?? 0), lateMinutes: Number(d.late_minutes ?? 0),
    status: d.status as "on_leave" | "no_schedule" | "off" | "absent" | "not_in_yet" | "late" | "present",
  }));
  const correctionRows = (corrections.data ?? []).map((c: Record<string, unknown>) => {
    const p = c.profiles as { full_name: string | null; email: string } | null;
    return {
      userId: c.user_id as string, workDate: c.work_date as string,
      classification: c.classification as never, reason: (c.reason as string) ?? "",
      decidedByName: p ? (p.full_name?.trim() || p.email) : null, decidedAt: c.decided_at as string,
    };
  });

  const people = (members.data ?? []).map((m) => ({
    userId: m.user_id as string, agencyId: m.agency_id as string,
    active: m.status === "active", alreadyRewarded: rewarded.has(m.user_id as string),
    /* Dee, 2026-09-20: the founders do not clock in and management does not
       compete for the bonus. Defaulting to TRUE when the column is somehow
       absent keeps an ordinary agent earning; the database default is the
       same, so the two agree. */
    eligible: m.attendance_reward_eligible !== false,
  }));

  /* Policy is per agency; there is one agency, but the engine is asked with
     the right one regardless rather than assuming. */
  const summary = { quarter, closed: true, granted: 0, skipped: 0, exceptions: 0 };
  const byAgency = new Map<string, typeof people>();
  for (const p of people) byAgency.set(p.agencyId, [...(byAgency.get(p.agencyId) ?? []), p]);

  for (const [agencyId, group] of byAgency) {
    const policy = policyByAgency.get(agencyId) ?? mapPolicy(null);
    const outcomes = evaluateQuarter({
      quarter, today, policy, people: group,
      factsFor: (id) => factsFrom(days.filter((d) => d.userId === id), scheduleOf.get(id), { today }),
      hasSchedule: (id) => scheduleOf.has(id),
      correctionsFor: (id) => latestPerDay(correctionRows, id),
    });

    for (const o of outcomes) {
      if (o.decision === "skip") { summary.skipped += 1; continue; }
      if (o.decision === "exception") {
        summary.exceptions += 1;
        await sb.from("reward_sweep_exceptions").insert({
          agency_id: agencyId, user_id: o.userId, quarter, kind: o.kind, detail: o.detail,
        });
        continue;
      }
      /* Through the canonical grant, so every rule around a reward — quarter
         closed, one per quarter, the notification — is the same one a manager
         goes through. Service role means auth.uid() is null: issued_automatically. */
      const { error } = await sb.rpc("grant_attendance_reward", {
        p_user: o.userId, p_quarter: quarter,
        p_note: "Issued automatically at quarter close.",
        p_final_score: o.finalScore, p_policy: policy as unknown as Record<string, unknown>,
      });
      if (error) {
        summary.exceptions += 1;
        await sb.from("reward_sweep_exceptions").insert({
          agency_id: agencyId, user_id: o.userId, quarter, kind: "grant_failed", detail: error.message,
        });
      } else {
        summary.granted += 1;
      }
    }
  }

  return json(200, summary);
});

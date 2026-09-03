/**
 * Management dashboard metrics — partner health and team workload.
 *
 * These are business calculations, not presentation, so they live in the domain
 * layer and are computed the same way for every division (rules 9 and 13).
 * What differs between divisions is supplied as configuration: the SLA
 * thresholds, which statuses count as inactive or as an escalation, and how a
 * client's open-work count is read (dispute items vs funding files).
 */

import type {
  OpsClient,
  OpsPartner,
} from "@/lib/fulfillment/ops-client-domain";
import { clientGroupLabel } from "@/lib/fulfillment/ops-client-domain";

/** How one division measures its own work. */
export interface OpsMetricsConfig<T extends OpsClient> {
  /** At or below this many SLA hours a client counts as overdue / at risk. */
  overdueHours: number;
  /** At or below this many SLA hours a client counts as due today. */
  dueTodayHours: number;
  /** Statuses that take a client out of the active population. */
  inactiveStatuses: readonly string[];
  /** Statuses that count as an escalation for partner health. */
  escalationStatuses: readonly string[];
  /** Units of open work on one client. */
  openCount: (client: T) => number;
}

export type PartnerHealth = "Healthy" | "Attention";

export interface PartnerHealthRow<P extends OpsPartner> {
  partner: P;
  activeCount: number;
  overdue: number;
  escalations: number;
  slaRisk: boolean;
  health: PartnerHealth;
}

export interface TeamWorkloadRow {
  agent: string;
  open: number;
  dueToday: number;
  overdue: number;
  partners: string[];
}

export const isActiveClient = <T extends OpsClient>(
  client: T,
  config: OpsMetricsConfig<T>,
): boolean => !config.inactiveStatuses.includes(client.status);

const isOverdue = <T extends OpsClient>(
  client: T,
  config: OpsMetricsConfig<T>,
): boolean =>
  client.slaHoursRemaining !== undefined &&
  client.slaHoursRemaining <= config.overdueHours;

/** Clients belonging to one partner, by either scope key. */
export const clientsForPartner = <T extends OpsClient, P extends OpsPartner>(
  partner: P,
  clients: T[],
): T[] =>
  clients.filter(
    (c) =>
      c.organizationId === partner.scopeId ||
      c.outsourcingGroupId === partner.scopeId,
  );

/**
 * One row per partner: how much active work they have and whether it is at
 * risk. A paused partner always shows Attention regardless of SLA, because a
 * paused relationship needs a decision even when nothing is overdue.
 */
export function computePartnerHealth<T extends OpsClient, P extends OpsPartner>(
  partners: readonly P[],
  clients: T[],
  config: OpsMetricsConfig<T>,
): PartnerHealthRow<P>[] {
  return partners.map((partner) => {
    const active = clientsForPartner(partner, clients).filter((c) =>
      isActiveClient(c, config),
    );
    const overdue = active.filter((c) => isOverdue(c, config)).length;
    const escalations = active.filter((c) =>
      config.escalationStatuses.includes(c.status),
    ).length;
    const slaRisk = overdue > 0 || escalations > 0;
    return {
      partner,
      activeCount: active.length,
      overdue,
      escalations,
      slaRisk,
      health: partner.status === "Paused" || slaRisk ? "Attention" : "Healthy",
    };
  });
}

/** One row per assigned agent, across every partner they touch. */
export function computeTeamWorkload<T extends OpsClient>(
  activeClients: T[],
  config: OpsMetricsConfig<T>,
): TeamWorkloadRow[] {
  const byAgent = new Map<
    string,
    { open: number; dueToday: number; overdue: number; partners: Set<string> }
  >();

  for (const client of activeClients) {
    const agent = client.assignedAgent ?? "Unassigned";
    let row = byAgent.get(agent);
    if (!row) {
      row = { open: 0, dueToday: 0, overdue: 0, partners: new Set() };
      byAgent.set(agent, row);
    }
    row.open += config.openCount(client);
    if (
      client.slaHoursRemaining !== undefined &&
      client.slaHoursRemaining <= config.dueTodayHours
    ) {
      row.dueToday++;
    }
    if (isOverdue(client, config)) row.overdue++;
    row.partners.add(clientGroupLabel(client));
  }

  return [...byAgent.entries()].map(([agent, row]) => ({
    agent,
    open: row.open,
    dueToday: row.dueToday,
    overdue: row.overdue,
    partners: [...row.partners],
  }));
}

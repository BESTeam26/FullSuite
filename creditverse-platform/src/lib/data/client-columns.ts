/**
 * Custom columns on the CreditOps client list.
 *
 * Dee, 2026-09-22: *"The task list should be able to create column like
 * dropdown and on the actual list i should be able to change the drop down.
 * dont make it too complicated."*
 *
 * ── THE SAME ENGINE THE WORKSPACES USE ────────────────────────────────────
 *
 * `workspace_fields` has always stored a column — key, label, type, options —
 * and `custom_field_values` now stores a value against a record of any kind.
 * A client column is a `workspace_fields` row with
 * `entity_type = 'fulfillment_client'` and an `agency_id`, so there is ONE
 * definition of what a custom column is (rules 2 and 17: customisation is
 * data, not a second table).
 *
 * ── ONE REQUEST FOR THE WHOLE LIST ────────────────────────────────────────
 *
 * The values for every visible client arrive in a single query keyed by the
 * ids on screen, never one request per row (rule 14). Row Level Security
 * still decides: a client the caller cannot see carries no readable values.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export type ClientColumnType = "text" | "select" | "number" | "date";

export interface ClientColumn {
  id: string;
  key: string;
  label: string;
  type: ClientColumnType;
  /** The dropdown's choices. Empty for every other type. */
  options: string[];
  position: number;
}

/** field_id → value, for one client. */
export type ClientColumnValues = Record<string, string | number | null>;

const ENTITY = "fulfillment_client";

/** `{ choices: [...] }` is the stored shape; anything else means no choices. */
function readChoices(options: unknown): string[] {
  if (!options || typeof options !== "object" || Array.isArray(options)) return [];
  const choices = (options as { choices?: unknown }).choices;
  return Array.isArray(choices) ? choices.map(String) : [];
}

export function useClientColumns() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: ["creditops", "client-columns"],
    queryFn: async (): Promise<ClientColumn[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("workspace_fields")
        .select("id, key, label, field_type, options, position")
        .eq("entity_type", ENTITY)
        .is("archived_at", null)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        key: r.key as string,
        label: r.label as string,
        type: (r.field_type as ClientColumnType) ?? "text",
        /* The column stores `{ choices: [...] }` — an object, not a bare
           array, which `workspace_fields_options_shape` enforces. */
        options: readChoices(r.options),
        position: (r.position as number) ?? 0,
      }));
    },
    enabled: live,
    staleTime: 5 * 60_000,
  });
  return { columns: q.data ?? [], isLoading: live && q.isLoading };
}

/** Every custom value for the clients currently on screen, in one request. */
export function useClientColumnValues(clientIds: readonly string[]) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  /* A stable key: the same set of clients in a different order is the same
     request, and re-sorting the list must not refetch. */
  const ids = [...clientIds].sort();
  const q = useQuery({
    queryKey: ["creditops", "client-column-values", ids],
    queryFn: async (): Promise<Record<string, ClientColumnValues>> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("custom_field_values")
        .select("field_id, entity_id, value")
        .eq("entity_type", ENTITY)
        .in("entity_id", ids);
      if (error) throw error;
      const out: Record<string, ClientColumnValues> = {};
      for (const r of data ?? []) {
        const client = r.entity_id as string;
        (out[client] ??= {})[r.field_id as string] = (r.value as string | number | null) ?? null;
      }
      return out;
    },
    enabled: live && ids.length > 0,
    staleTime: 30_000,
  });
  return { byClient: q.data ?? {}, isLoading: live && q.isLoading };
}

export function useSetClientColumnValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientId: string; fieldId: string; value: string | number | null }) => {
      const sb = requireSupabase();
      /* Clearing a cell removes the row rather than storing an empty string:
         "no value" and "the empty value" are different answers. */
      if (input.value === null || input.value === "") {
        const { error } = await sb.from("custom_field_values").delete()
          .eq("entity_type", ENTITY).eq("entity_id", input.clientId).eq("field_id", input.fieldId);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await sb.from("custom_field_values").upsert(
        { entity_type: ENTITY, entity_id: input.clientId, field_id: input.fieldId,
          value: input.value as never, updated_at: new Date().toISOString() },
        { onConflict: "field_id,entity_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["creditops", "client-column-values"] }); },
  });
}

export interface NewClientColumn {
  label: string;
  type: ClientColumnType;
  options: string[];
}

/**
 * A stable key from the label, so a rename never orphans the stored values.
 *
 * `workspace_fields_key_check` demands `^[a-z][a-z0-9_]{0,39}$`, so a label
 * of "2026 Goals" or "!!" has to end up as something that still starts with a
 * letter — hence the prefix rather than a rejected insert.
 */
export const columnKeyFor = (label: string) => {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const safe = /^[a-z]/.test(slug) ? slug : `c_${slug}`;
  return (safe.replace(/_+$/, "") || `c_${Date.now().toString(36)}`).slice(0, 40).replace(/_+$/, "");
};

export function useCreateClientColumn() {
  const qc = useQueryClient();
  const auth = useAuth();
  return useMutation({
    mutationFn: async (input: NewClientColumn) => {
      const sb = requireSupabase();
      const agencyId = auth.agencyMembership?.agency_id;
      if (!agencyId) throw new Error("No agency on this session.");
      const { error } = await sb.from("workspace_fields").insert({
        agency_id: agencyId,
        entity_type: ENTITY,
        key: columnKeyFor(input.label),
        label: input.label.trim(),
        field_type: input.type,
        options: { choices: input.type === "select" ? input.options : [] },
        position: Date.now() % 100000,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["creditops", "client-columns"] }); },
  });
}

/** Archived, never deleted: the values stay, and the column can come back. */
export function useArchiveClientColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fieldId: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("workspace_fields")
        .update({ archived_at: new Date().toISOString() } as never).eq("id", fieldId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["creditops", "client-columns"] }); },
  });
}

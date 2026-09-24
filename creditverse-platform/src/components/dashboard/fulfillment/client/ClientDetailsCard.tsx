/**
 * The client's details, readable at a glance and editable in place.
 *
 * Dee, 2026-09-24: "I also need a WAY TO EDIT ALL THESE INFORMATION." The
 * file could show a wrong phone number and offer nothing to do about it —
 * which matters most right now, because 71 clients have just arrived from
 * ClickUp and the import's own report names the ones missing an email, a
 * phone or a date of birth.
 *
 * Read mode first, one Edit button. Not click-each-field-to-edit: correcting
 * an imported record usually means fixing three things at once, and a form
 * you Save once is fewer decisions than six little editors that each save
 * behind your back.
 *
 * The button appears for everybody. Whether the save lands is the database's
 * answer — `client_writable()` on the person, the row policy on the work file
 * — and a refusal is shown as the refusal it is. Hiding the button would be
 * presentation standing in for permission, which is rule 1.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";
import {
  fetchClientDetails, saveClientDetails, stateProblem, type ClientDetails,
} from "@/lib/data/client-details";

const FIELDS: { key: keyof ClientDetails; label: string; type?: string; placeholder?: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "addressLine1", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State", placeholder: "FL" },
  { key: "postalCode", label: "ZIP" },
];

export function ClientDetailsCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ClientDetails | null>(null);

  const q = useQuery({
    queryKey: ["creditops", "details", clientId],
    queryFn: () => fetchClientDetails(clientId),
    enabled: !!clientId,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (next: ClientDetails) => saveClientDetails(clientId, next),
    onSuccess: () => {
      setDraft(null);
      /* The file, the list and the directory all read these. */
      void qc.invalidateQueries({ queryKey: ["creditops", "details", clientId] });
      void qc.invalidateQueries({ queryKey: ["creditops", "clients"] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) =>
      /* The draft is deliberately kept, so a refusal or a typo does not cost
         somebody everything they just typed. */
      toast({ title: "That did not save", description: e.message, variant: "destructive" }),
  });

  if (q.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (q.isError || !q.data) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-status-danger">
          The client's details could not be loaded.
          {q.error ? ` ${(q.error as Error).message}` : ""}
        </p>
      </section>
    );
  }

  const details = q.data;
  const editing = draft !== null;
  const value = draft ?? details;
  const badState = editing ? stateProblem(value.state) : null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-bold text-foreground">Client details</h2>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setDraft({ ...details })}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => draft && save.mutate(draft)}
              disabled={save.isPending || !!badState}
            >
              {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="min-w-0">
            <label
              htmlFor={editing ? `client-${f.key}` : undefined}
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              {f.label}
            </label>
            {editing ? (
              <>
                <Input
                  id={`client-${f.key}`}
                  type={f.type ?? "text"}
                  value={value[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, [f.key]: e.target.value } : d))
                  }
                  className="mt-1 h-8 text-xs"
                  aria-invalid={f.key === "state" && !!badState}
                  aria-describedby={f.key === "state" && badState ? "client-state-problem" : undefined}
                />
                {f.key === "state" && badState && (
                  /* Said here rather than discovered on save: the column takes
                     two letters, and a whole state name is what stopped two of
                     these clients importing at all. */
                  <p id="client-state-problem" className="mt-1 text-[11px] text-status-danger">
                    {badState}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-0.5 break-words text-xs text-foreground">
                {f.key === "dateOfBirth" && details.dateOfBirth
                  ? formatDate(details.dateOfBirth)
                  : details[f.key] || <span className="text-muted-foreground">Not recorded</span>}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

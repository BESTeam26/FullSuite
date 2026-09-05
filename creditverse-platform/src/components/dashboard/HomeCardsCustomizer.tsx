/**
 * "Customize Home" — choose and order the cards on the organization Home.
 * Pure list edits from `lib/dashboard/home-cards`; one save writes the whole
 * list. Nothing here is a fake control: Save persists, Reset restores default.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  moveHomeCard,
  toggleHomeCard,
  type HomeCardDef,
  type HomeCardKey,
} from "@/lib/dashboard/home-cards";

interface Props {
  /** Every card this organization may show, in catalogue order. */
  available: HomeCardDef[];
  /** Currently shown, in order. */
  shown: HomeCardKey[];
  saving: boolean;
  error: string | null;
  onSave: (cards: HomeCardKey[] | null) => void;
  onClose: () => void;
}

export function HomeCardsCustomizer({ available, shown, saving, error, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<HomeCardKey[]>(shown);
  const hidden = available.filter((c) => !draft.includes(c.key));
  const byKey = new Map(available.map((c) => [c.key, c]));

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4" role="region" aria-label="Customize Home">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">Customize Home</h2>
          <p className="text-xs text-muted-foreground">Choose the cards you want and their order. Saved to your account.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onSave(null)} disabled={saving}>Reset to default</Button>
          <Button type="button" size="sm" onClick={() => onSave(draft)} disabled={saving || draft.length === 0}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save layout
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Shown</p>
          {draft.length === 0 ? (
            <p className="text-xs text-muted-foreground">Turn on at least one card.</p>
          ) : (
            <ul className="space-y-1.5">
              {draft.map((key, i) => (
                <li key={key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <Switch checked onCheckedChange={() => setDraft(toggleHomeCard(draft, key))} aria-label={`Hide ${byKey.get(key)?.label ?? key}`} />
                  <span className="flex-1 text-sm text-foreground">{byKey.get(key)?.label ?? key}</span>
                  <button type="button" onClick={() => setDraft(moveHomeCard(draft, key, -1))} disabled={i === 0} aria-label="Move up" className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setDraft(moveHomeCard(draft, key, 1))} disabled={i === draft.length - 1} aria-label="Move down" className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hidden</p>
          {hidden.length === 0 ? (
            <p className="text-xs text-muted-foreground">Every available card is shown.</p>
          ) : (
            <ul className="space-y-1.5">
              {hidden.map((c) => (
                <li key={c.key} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                  <Switch checked={false} onCheckedChange={() => setDraft(toggleHomeCard(draft, c.key))} aria-label={`Show ${c.label}`} />
                  <span className="flex-1 text-sm text-muted-foreground">{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-status-danger">{error}</p>}
    </div>
  );
}

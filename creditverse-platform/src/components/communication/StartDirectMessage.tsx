/**
 * Starting a direct message.
 *
 * ── FIND, THEN CREATE ──────────────────────────────────────────────────────
 *
 * Dee, §13: "Do not create a second DM row when the participants reverse who
 * starts it. For the same participant set: reuse existing active Direct
 * conversation."
 *
 * That rule is kept in `open_direct_channel()`, which looks for a live direct
 * conversation whose member set is EXACTLY the two people before it creates
 * one — so Dee messaging Rowell and Rowell messaging Dee land in the same
 * place, and this control can be pressed as often as anybody likes without
 * accumulating empty conversations.
 *
 * The list is the workforce roster, which excludes the matrix's fixture
 * accounts. The database refuses a DM with somebody who is not active staff of
 * the same agency in any case; this just does not offer it.
 */
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useChannelActions } from "@/lib/data/use-channels";

export function StartDirectMessage({ onOpened }: { onOpened: (channelId: string) => void }) {
  const auth = useAuth();
  const workforce = useWorkforce();
  const actions = useChannelActions();
  const [who, setWho] = useState("");

  const colleagues = (workforce.data?.people ?? []).filter((p) => p.userId !== auth.user?.id);
  if (colleagues.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Start a direct message
      </p>
      <div className="flex gap-1.5">
        <OpsSelect size="sm" value={who} onValueChange={setWho}
          aria-label="Message someone" placeholder="Message someone"
          options={colleagues.map((p) => ({ value: p.userId, label: p.name }))} />
        <Button size="sm" variant="outline" disabled={!who || actions.openDirect.isPending}
          onClick={() => actions.openDirect.mutate(who, {
            onSuccess: (channelId) => { onOpened(channelId); setWho(""); },
          })}>
          {actions.openDirect.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Send className="h-3.5 w-3.5" />}
          <span className="sr-only">Open direct message</span>
        </Button>
      </div>
      {actions.openDirect.isError && (
        <p role="alert" className="mt-1 px-1 text-[11px] text-status-danger">
          {(actions.openDirect.error as Error).message}
        </p>
      )}
    </div>
  );
}

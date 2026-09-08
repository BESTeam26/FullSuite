import { useMemo, useState } from "react";
import {
  Archive,
  ExternalLink,
  History,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format-date";
import {
  byPlatform,
  credentialHref,
  ROTATION_LABEL,
  rotationState,
  type RotationState,
} from "@/lib/partners/credential-domain";
import type { PartnerCredential } from "@/lib/data/partner-credentials";
import {
  useCredentialAccess,
  useCredentialEvents,
  useCredentialPlatforms,
  usePartnerCredentials,
} from "@/lib/data/use-partner-credentials";
import { CopyField } from "./CopyField";
import { CredentialPasswordField } from "./CredentialPasswordField";
import { CredentialFormDialog } from "./CredentialFormDialog";
import { ArchiveCredentialDialog } from "./ArchiveCredentialDialog";

/**
 * A partner's logins, in the form the work needs them.
 *
 * WHAT THIS REPLACES
 *
 * Credentials lived in ClickUp task descriptions in plain text, because that
 * is where the team could reach them. Reaching them is not the problem to
 * solve away — it is the requirement. So the ordinary things are one click:
 * the username, the link, and which mailbox the security code lands in are
 * all in the open and all copyable. Only the password is held back, and only
 * behind a capability that records who looked.
 */
export const PartnerCredentialsTab = ({ groupId }: { groupId: string }) => {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PartnerCredential | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<PartnerCredential | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const platforms = useCredentialPlatforms();
  const credentials = usePartnerCredentials(groupId, showArchived);
  const access = useCredentialAccess();

  const order = useMemo(
    () => (platforms.data ?? []).map((p) => p.key),
    [platforms.data],
  );
  const platformLabel = useMemo(
    () => new Map((platforms.data ?? []).map((p) => [p.key, p.label])),
    [platforms.data],
  );
  const grouped = useMemo(
    () => byPlatform(credentials.data ?? [], order),
    [credentials.data, order],
  );

  const rows = credentials.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-status-success" />
          <span>
            Usernames and links are in the open. Passwords are stored
            encrypted, and every time one is shown it is recorded against the
            person who asked.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          {access.mayManage && (
            <Button size="sm" className="h-8 text-xs" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add a login
            </Button>
          )}
        </div>
      </div>

      {credentials.isLoading && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!credentials.isLoading && rows.length === 0 && (
        <Card className="p-8 text-center">
          <KeyRound className="mx-auto mb-2 h-8 w-8 stroke-1 text-muted-foreground opacity-50" />
          <p className="text-sm font-semibold text-foreground">No logins recorded</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {access.mayManage
              ? "Add the accounts BES needs to fulfil for this partner — DisputeFox, GoHighLevel, the shared mailbox, and anything else collected at onboarding."
              : "Nobody has recorded logins for this partner yet."}
          </p>
        </Card>
      )}

      {grouped.map(({ platformKey, items }) => (
        <section key={platformKey} className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {platformLabel.get(platformKey) ?? platformKey}
          </h3>
          {items.map((c) => (
            <CredentialCard
              key={c.id}
              credential={c}
              mayReveal={access.mayReveal}
              mayManage={access.mayManage}
              onEdit={() => setEditing(c)}
              onArchive={() => setArchiving(c)}
              historyOpen={historyFor === c.id}
              onToggleHistory={() =>
                setHistoryFor((id) => (id === c.id ? null : c.id))
              }
            />
          ))}
        </section>
      ))}

      {(creating || editing) && (
        <CredentialFormDialog
          groupId={groupId}
          credential={editing}
          platforms={platforms.data ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      {archiving && (
        <ArchiveCredentialDialog
          groupId={groupId}
          credential={archiving}
          onClose={() => setArchiving(null)}
        />
      )}
    </div>
  );
};

const ROTATION_TONE: Record<RotationState, string> = {
  none: "",
  scheduled: "border-border bg-muted text-muted-foreground",
  "due-soon": "border-amber-500/30 bg-amber-500/10 text-status-warning",
  overdue: "border-red-500/30 bg-red-500/10 text-status-danger",
};

const CredentialCard = ({
  credential: c,
  mayReveal,
  mayManage,
  onEdit,
  onArchive,
  historyOpen,
  onToggleHistory,
}: {
  credential: PartnerCredential;
  mayReveal: boolean;
  mayManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) => {
  const rotation = rotationState(c.rotationDueOn);
  const href = credentialHref(c.url);
  const archived = c.archivedAt !== null;

  return (
    <Card className={archived ? "border-dashed p-4 opacity-70" : "p-4"}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{c.label}</span>
            {archived && (
              <Badge variant="outline" className="text-[10px]">
                Archived {formatDate(c.archivedAt)}
              </Badge>
            )}
            {!archived && rotation !== "none" && (
              <Badge
                variant="outline"
                className={`text-[10px] ${ROTATION_TONE[rotation]}`}
              >
                {ROTATION_LABEL[rotation]} · {formatDate(c.rotationDueOn)}
              </Badge>
            )}
          </div>
          {archived && c.archivedReason && (
            <p className="mt-0.5 text-xs text-muted-foreground">{c.archivedReason}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={onToggleHistory}
          >
            <History className="mr-1 h-3.5 w-3.5" />
            {historyOpen ? "Hide access" : "Who used it"}
          </Button>
          {mayManage && !archived && (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onEdit}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onArchive}>
                <Archive className="mr-1 h-3.5 w-3.5" /> Archive
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {c.username && <CopyField label="Username" value={c.username} />}
        {!archived && (
          <CredentialPasswordField
            credentialId={c.id}
            hasSecret={c.hasSecret}
            mayReveal={mayReveal}
          />
        )}
        {c.url && (
          <div className="min-w-0">
            <CopyField label="Sign-in link" value={c.url} mono={false} />
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="-mt-4 inline-flex items-center gap-1 text-[10px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Open <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        )}
        {c.codeDestination && (
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Security code goes to
            </div>
            <p className="flex items-center gap-1 text-xs text-foreground">
              <Smartphone className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate" title={c.codeDestination}>
                {c.codeDestination}
              </span>
            </p>
            <div className="h-4" />
          </div>
        )}
      </div>

      {c.notes && (
        <p className="mt-1 whitespace-pre-wrap border-t border-border pt-2 text-xs text-muted-foreground">
          {c.notes}
        </p>
      )}

      {c.lastRotatedAt && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Password last changed {formatDate(c.lastRotatedAt)}
        </p>
      )}

      {historyOpen && <CredentialHistory credentialId={c.id} />}
    </Card>
  );
};

const ACTION_LABEL: Record<string, string> = {
  created: "added it",
  updated: "edited it",
  revealed: "viewed the password",
  rotated: "changed the password",
  archived: "archived it",
};

/**
 * Who has touched this login, newest first.
 *
 * Loaded only when opened — it is the rarely-asked question, and fetching it
 * for every card on the page would be a query per credential for something
 * nobody is looking at (rule 14).
 */
const CredentialHistory = ({ credentialId }: { credentialId: string }) => {
  const events = useCredentialEvents(credentialId);
  return (
    <div className="mt-3 border-t border-border pt-2">
      {events.isLoading && (
        <p className="text-[11px] text-muted-foreground">Loading the access record…</p>
      )}
      {!events.isLoading && (events.data ?? []).length === 0 && (
        <p className="text-[11px] text-muted-foreground">Nothing recorded yet.</p>
      )}
      <ul className="space-y-1">
        {(events.data ?? []).map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
            <span className="font-medium text-foreground">
              {e.actorName ?? "Someone no longer on the team"}
            </span>
            <span className="text-muted-foreground">
              {ACTION_LABEL[e.action] ?? e.action}
            </span>
            <span className="text-muted-foreground">· {formatDate(e.createdAt)}</span>
            {e.note && <span className="text-muted-foreground">· {e.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

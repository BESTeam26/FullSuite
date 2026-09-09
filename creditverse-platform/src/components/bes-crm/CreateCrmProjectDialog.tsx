import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchOutsourcingGroups } from "@/lib/data/partners";
import { useAuth } from "@/lib/auth/auth-context";
import { useCreateCrmProject, useCrmEngineOptions } from "@/lib/data/use-crm";
import { cn } from "@/lib/utils";

/**
 * Open a build for a partner.
 *
 * The one decision that shapes everything after it is WHICH ENGINES the
 * partner bought (Dee §11): a Website-only project must contain no Sales
 * work, no Fulfillment work and no Sales milestone — not hidden, absent.
 * So engines are the centre of this form, and only engines with a PUBLISHED
 * template can be chosen: a draft is somebody's work in progress, not a
 * standard a live project can be held to.
 */
export const CreateCrmProjectDialog = ({ onClose }: { onClose: () => void }) => {
  const auth = useAuth();
  const engines = useCrmEngineOptions();
  const create = useCreateCrmProject();

  const groups = useQuery({
    queryKey: ["partners", "groups"] as const,
    queryFn: fetchOutsourcingGroups,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });

  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetGoLive, setTargetGoLive] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const canSave =
    name.trim().length > 0 && groupId && selected.size > 0 && !create.isPending;

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        engines: [...selected],
        partnerGroupId: groupId,
        targetGoLive: targetGoLive || null,
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "The project could not be created.",
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New build project</DialogTitle>
          <DialogDescription>
            Only the engines the partner bought. Work for anything else will
            not exist in the project — it is not hidden, it is absent.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="crm-name">Project name</Label>
            <Input
              id="crm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wavy One — GHL build"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="crm-partner">Partner</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="crm-partner">
                <SelectValue placeholder={groups.isLoading ? "Loading…" : "Choose a partner"} />
              </SelectTrigger>
              <SelectContent>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-medium text-foreground">Engines in scope</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {(engines.data ?? []).map((e) => (
                <label
                  key={e.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs transition-colors",
                    !e.published && "cursor-not-allowed opacity-50",
                    selected.has(e.key)
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(e.key)}
                    disabled={!e.published}
                    onChange={() => toggle(e.key)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{e.label}</span>
                    {!e.published && (
                      <span className="block text-[10px] text-muted-foreground">
                        No published template yet
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="crm-golive">Target go-live</Label>
            <Input
              id="crm-golive"
              type="date"
              value={targetGoLive}
              onChange={(e) => setTargetGoLive(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-status-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSave}>
            {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

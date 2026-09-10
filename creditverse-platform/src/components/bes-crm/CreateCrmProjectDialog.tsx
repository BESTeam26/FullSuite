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
  const [business, setBusiness] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetGoLive, setTargetGoLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null>(null);

  /* Dee §31: practical presets, so nobody walks a website-only partner
     through the full infrastructure maze. A preset is a STARTING SELECTION —
     the checkboxes stay editable, and touching them makes the scope Custom.
     Only published engines are ever selected. */
  const applyPreset = (key: string, engineKeys: string[]) => {
    const publishable = new Set(
      (engines.data ?? []).filter((e) => e.published).map((e) => e.key),
    );
    setSelected(new Set(engineKeys.filter((k) => publishable.has(k))));
    setPreset(key);
  };
  const PRESETS: { key: string; label: string; engines: string[] }[] = [
    { key: "full", label: "Full build", engines: (engines.data ?? []).filter((e) => e.published).map((e) => e.key) },
    { key: "website", label: "Website only", engines: ["project_setup", "website_funnel", "qa_launch"] },
    { key: "sales", label: "Sales engine", engines: ["project_setup", "sales", "communication", "qa_launch"] },
    { key: "fulfillment", label: "Fulfillment engine", engines: ["project_setup", "fulfillment", "onboarding_support", "qa_launch"] },
    { key: "custom", label: "Custom", engines: [] },
  ];

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPreset("custom");
  };

  const canSave =
    name.trim().length > 0 && groupId && selected.size > 0 && !create.isPending;

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        engines: [...selected],
        partnerGroupId: groupId,
        businessName: business.trim() || null,
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

          <div className="grid gap-1.5">
            <Label htmlFor="crm-business">Business / brand <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="crm-business"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="Which of the partner's businesses this build is for"
            />
          </div>

          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-medium text-foreground">Build scope</legend>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Scope preset">
              {PRESETS.map((pr) => (
                <button
                  key={pr.key}
                  type="button"
                  onClick={() => applyPreset(pr.key, pr.engines)}
                  aria-pressed={preset === pr.key}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    preset === pr.key
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {pr.label}
                </button>
              ))}
            </div>
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

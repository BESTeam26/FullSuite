/**
 * Create a workspace. Icon and colour are fixed, small sets the board can
 * render — not a free-form picker.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { WORKSPACE_COLOURS, WORKSPACE_ICONS, WorkspaceIcon } from "./workspace-visuals";
import { cn } from "@/lib/utils";

export function NewWorkspaceDialog({
  open,
  onOpenChange,
  onCreate,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; description: string | null; icon: string; colour: string }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string>(WORKSPACE_ICONS[0]);
  const [colour, setColour] = useState<string>(WORKSPACE_COLOURS[0]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate({ name, description: description.trim() || null, icon, colour });
          }}
        >
          <div>
            <Label htmlFor="ws-name" className="text-xs">Name</Label>
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Business Acquisition" autoFocus maxLength={80} />
          </div>
          <div>
            <Label htmlFor="ws-desc" className="text-xs">Description (optional)</Label>
            <Textarea id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Icon</p>
              <div className="flex gap-1">
                {WORKSPACE_ICONS.map((i) => (
                  <button key={i} type="button" onClick={() => setIcon(i)} aria-label={`Icon ${i}`} aria-pressed={icon === i}
                    className={cn("rounded-md border p-1.5 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", icon === i ? "border-primary bg-primary/10" : "border-border")}>
                    <WorkspaceIcon name={i} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Colour</p>
              <div className="flex gap-1">
                {WORKSPACE_COLOURS.map((c) => (
                  <button key={c} type="button" onClick={() => setColour(c)} aria-label={`Colour ${c}`} aria-pressed={colour === c}
                    className={cn("h-7 w-7 rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", colour === c ? "border-foreground" : "border-transparent")}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || pending}>Create workspace</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

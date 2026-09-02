import { useState } from "react";
import { Palette, Check, Globe } from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const MgmtBranding = () => {
  const { whiteLabel, setWhiteLabel } = useDiyManagement();
  const [draft, setDraft] = useState(whiteLabel);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setWhiteLabel(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          White-Label Configuration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your consumers see your brand, not BES. Configure the consumer-facing
          portal here.
        </p>
      </div>

      <Card className="max-w-2xl p-6">
        <div className="grid gap-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Program name</Label>
              <Input
                value={draft.programName}
                onChange={(e) =>
                  setDraft({ ...draft, programName: e.target.value })
                }
                className="mt-1.5"
                placeholder="ABC Credit Builder"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                What consumers see as the product name.
              </p>
            </div>
            <div>
              <Label>Portal name</Label>
              <Input
                value={draft.portalName || ""}
                onChange={(e) =>
                  setDraft({ ...draft, portalName: e.target.value })
                }
                className="mt-1.5"
                placeholder="DIY Credit"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Support email</Label>
              <Input
                value={draft.supportEmail || ""}
                onChange={(e) =>
                  setDraft({ ...draft, supportEmail: e.target.value })
                }
                className="mt-1.5"
                placeholder="help@example.com"
              />
            </div>
            <div>
              <Label>Support phone</Label>
              <Input
                value={draft.supportPhone || ""}
                onChange={(e) =>
                  setDraft({ ...draft, supportPhone: e.target.value })
                }
                className="mt-1.5"
                placeholder="(555) 555-0100"
              />
            </div>
          </div>

          <div>
            <Label>Primary color</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                type="color"
                value={draft.primaryColor || "#005F4B"}
                onChange={(e) =>
                  setDraft({ ...draft, primaryColor: e.target.value })
                }
                className="h-10 w-14 rounded-lg border border-border bg-background p-1"
              />
              <Input
                value={draft.primaryColor || ""}
                onChange={(e) =>
                  setDraft({ ...draft, primaryColor: e.target.value })
                }
                className="max-w-xs"
                placeholder="#005F4B"
              />
            </div>
          </div>

          <div>
            <Label>Welcome copy</Label>
            <textarea
              value={draft.welcomeCopy || ""}
              onChange={(e) =>
                setDraft({ ...draft, welcomeCopy: e.target.value })
              }
              className="mt-1.5 min-h-[72px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="You're in control..."
            />
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Custom domain (future)
            </Label>
            <Input
              value={draft.customDomain || ""}
              onChange={(e) =>
                setDraft({ ...draft, customDomain: e.target.value })
              }
              className="mt-1.5"
              placeholder="portal.yourbrand.com"
              disabled
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Custom domains require DNS verification — backend integration
              required.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save}>
              <Palette className="h-4 w-4" /> Save white-label config
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold">Preview</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This is what your consumer sees as the program name:
        </p>
        <div
          className="mt-4 rounded-2xl p-6 text-white"
          style={{
            background: `linear-gradient(135deg, ${draft.primaryColor || "#005F4B"}, #003D31)`,
          }}
        >
          <p className="text-xs uppercase tracking-widest opacity-80">
            {draft.portalName || "DIY Credit"}
          </p>
          <h3 className="mt-1 text-2xl font-bold">{draft.programName}</h3>
          <p className="mt-2 max-w-md text-sm opacity-90">
            {draft.welcomeCopy}
          </p>
        </div>
      </Card>
    </div>
  );
};

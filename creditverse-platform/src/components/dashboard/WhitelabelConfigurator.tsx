import { useState } from "react";
import { SubAccount } from "@/lib/agency-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  subAccount: SubAccount;
  onSave: (
    subAccountId: string,
    branding: Partial<SubAccount["branding"]>,
  ) => void;
  onClose: () => void;
}

export const WhitelabelConfigurator = ({
  subAccount,
  onSave,
  onClose,
}: Props) => {
  const [customDomain, setCustomDomain] = useState(
    subAccount.branding?.customDomain || "",
  );
  const [companyTagline, setCompanyTagline] = useState(
    subAccount.branding?.companyTagline || "",
  );
  const [logoUrl, setLogoUrl] = useState(subAccount.branding?.logoUrl || "");
  const [primaryColor, setPrimaryColor] = useState(
    subAccount.branding?.primaryColor || "#EBAA15",
  );
  const [darkTheme, setDarkTheme] = useState(
    subAccount.branding?.darkTheme ?? true,
  );

  const handleSave = () => {
    onSave(subAccount.id, {
      customDomain,
      companyTagline,
      logoUrl,
      primaryColor,
      darkTheme,
    });
    onClose();
  };

  return (
    <div className="space-y-4 py-2 text-sm">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-status-warning text-xs">
            Organization White-Label Customization
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Configure custom domain CNAME, logo, and brand theme for{" "}
            {subAccount.name}
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-amber-500/40 text-status-warning text-[10px]"
        >
          Whitelabel Active
        </Badge>
      </div>

      <div className="space-y-1.5">
        <Label>Custom Domain (CNAME)</Label>
        <Input
          placeholder="e.g. portal.yourbrand.com"
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value)}
        />
        <p className="text-[10px] text-muted-foreground">
          Point CNAME record to{" "}
          <code className="text-status-warning font-mono">
            cname.blessedempireservices.com
          </code>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Company Tagline / Subtitle</Label>
        <Input
          placeholder="e.g. Premium Credit Restoration & Business Funding"
          value={companyTagline}
          onChange={(e) => setCompanyTagline(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Brand Logo URL</Label>
        <Input
          placeholder="https://example.com/logo.png"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Primary Brand Color</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-9 w-12 rounded border p-1 cursor-pointer bg-transparent"
            />
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Default Theme</Label>
          <div className="flex gap-2 items-center pt-2">
            <Button
              type="button"
              variant={darkTheme ? "default" : "outline"}
              size="sm"
              onClick={() => setDarkTheme(true)}
              className="flex-1 text-xs"
            >
              Dark Mode
            </Button>
            <Button
              type="button"
              variant={!darkTheme ? "default" : "outline"}
              size="sm"
              onClick={() => setDarkTheme(false)}
              className="flex-1 text-xs"
            >
              Light Mode
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          className="bg-gradient-gold text-charcoal font-bold hover:opacity-90"
        >
          Save Whitelabel Settings
        </Button>
      </div>
    </div>
  );
};

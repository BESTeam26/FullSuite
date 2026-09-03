import { useState } from "react";
import { ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePasswordReveal } from "@/lib/use-password-reveal";

export const CreditMonitoringCard = ({ provider }: { provider: string }) => {
  const { revealed, reveal } = usePasswordReveal();

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-status-success" />
        <h2 className="font-semibold">Credit monitoring</h2>
        <Badge className="bg-emerald-500/10 text-status-success">
          {provider}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Monitoring provider is set on the client account. If automatic import is
        unavailable, upload the 3-bureau PDF report in Import &amp; Analysis.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Login email</Label>
          <Input defaultValue="maria.g29@email.com" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Password</Label>
          <div className="mt-1 flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {revealed["monitoring"] ? "Mfsn2026!" : "••••••••"}
            </span>
            <button
              onClick={() => reveal("monitoring")}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              {revealed["monitoring"] ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Auto-hides after 8 seconds
          </p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            Last 4 of SSN (security)
          </Label>
          <p className="mt-1 text-sm font-medium">9978</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-4">
        Log in to monitoring
      </Button>
    </div>
  );
};

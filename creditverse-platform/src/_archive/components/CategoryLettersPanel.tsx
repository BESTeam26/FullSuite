// Category Letters Panel — shows all category-based dispute letters
// Each letter type is separated for clarity, documentation strength, and CFPB support.

import { useState } from "react";
import {
  Building2,
  AlertTriangle,
  Clock,
  FileSearch,
  UserRound,
  GraduationCap,
  Scale,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Upload,
  Mail,
  FileText,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LETTER_CATEGORIES, ftcResourceFor } from "@/lib/dispute/letters-and-channels";
import type { DisputePackage } from "@/lib/dispute/package-builder";

const iconMap = {
  Building2,
  AlertTriangle,
  Clock,
  FileSearch,
  UserRound,
  GraduationCap,
  Scale,
} as const;

export const CategoryLettersPanel = ({
  pkg,
  onPreview,
}: {
  pkg: DisputePackage;
  onPreview: (itemId: string) => void;
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold">Category-based letters</h2>
          <Badge className="bg-emerald-500/10 text-emerald-600">
            {pkg.totalLetters} letter group{pkg.totalLetters === 1 ? "" : "s"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The dispute package includes separate letters by account type. All
          category-based disputes remain separated for clarity, documentation
          strength, and CFPB support.
        </p>
      </div>

      <div className="space-y-3">
        {Object.entries(pkg.byCategory).map(([key, items]) => {
          const cat = LETTER_CATEGORIES.find((c) => c.key === key);
          if (!cat) return null;
          const Icon = iconMap[cat.icon as keyof typeof iconMap] ?? FileText;
          const isOpen = expandedKey === key;
          /* Archived screen. No consumer statement is recorded here, so the
             identity-theft resource is never available — which is the point:
             a category alone never reaches it (CR-4a). */
          const ftcRule = ftcResourceFor(items[0].item.category, undefined);

          return (
            <div
              key={key}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                onClick={() => setExpandedKey(isOpen ? null : key)}
                className="flex w-full items-center justify-between p-5 text-left hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40 ${cat.tone}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{cat.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
                      {cat.recipient}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {cat.ftcResourceRelevant && (
                      <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
                        <ShieldAlert className="h-3 w-3" /> FTC
                      </span>
                    )}
                    {cat.cfpbResourceRelevant && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                        <Scale className="h-3 w-3" /> CFPB
                      </span>
                    )}
                    <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                      <Upload className="h-3 w-3" /> EX upload
                    </span>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                    {items.length}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border p-5">
                  <p className="mb-4 text-sm text-muted-foreground">
                    {cat.description}
                  </p>

                  {ftcRule && (
                    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                        <ShieldAlert className="h-4 w-4" /> Resource for the consumer
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {ftcRule.purpose} <span className="font-mono">{ftcRule.url}</span>
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">{ftcRule.caution}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {items.map((pkgItem) => (
                      <div
                        key={pkgItem.item.id}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card ${cat.tone}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium">
                              {pkgItem.item.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {pkgItem.item.subtype
                                ? `${pkgItem.item.subtype} · `
                                : ""}
                              {pkgItem.item.status}
                              {pkgItem.item.balance
                                ? ` · ${pkgItem.item.balance}`
                                : ""}
                              {pkgItem.item.dofd
                                ? ` · DOFD ${pkgItem.item.dofd}`
                                : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 text-xs">
                            {pkgItem.item.bureaus.map((b) => (
                              <span
                                key={b}
                                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  b === "EQ"
                                    ? "bg-red-500/10 text-red-600"
                                    : b === "EX"
                                      ? "bg-blue-500/10 text-blue-600"
                                      : "bg-emerald-500/10 text-emerald-600"
                                }`}
                              >
                                {b}
                                {b === "EX" && (
                                  <Upload className="h-2.5 w-2.5" />
                                )}
                              </span>
                            ))}
                          </span>
                          {pkgItem.ftcBlocked && (
                            <span className="flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              FTC blocked
                            </span>
                          )}
                          {pkgItem.item.bureaus.some((b) => b !== "EX") && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                              <Mail className="h-2.5 w-2.5" /> Mail
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onPreview(pkgItem.item.id)}
                          >
                            <Eye className="h-3.5 w-3.5" /> Preview
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

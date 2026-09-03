// Builder Selector Panel — Factual, Metro2, Freeze, & Hybrid Dispute Letter Builders
// Matches the user's reference UI layout with 3 major category banners and sub-mode options:
// 1. Factual Dispute Letters (Rounds vs Anytime)
// 2. Metro2 Dispute Letters (Rounds vs Anytime)
// 3. Other Dispute Letters (Alternate Bureaus vs Security Freeze/Suppression)
// Also includes reference letter styles: Shock & Awe, Tactical Strike, Divide & Conquer,
// Precision Attack, Inquiry Only, Personal Info, Accounts Special, Collections Exclusive.

import { useState } from "react";
import {
  FileText,
  Layers,
  Building2,
  Sparkles,
  Snowflake,
  PlayCircle,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SECONDARY_BUREAUS } from "@/lib/dispute/letters-and-channels";
import type { DisputePackage } from "@/lib/dispute/package-builder";

export type BuilderMode =
  | "factual"
  | "metro2"
  | "freeze"
  | "hybrid"
  | "easy"
  | "advanced"
  | "interim"
  | "secondary";

export type LetterTypeStyle =
  | "shock-and-awe"
  | "tactical-strike"
  | "divide-and-conquer"
  | "precision-attack"
  | "inquiry-only"
  | "personal-info"
  | "accounts-special"
  | "collections-exclusive";

export const BuilderSelectorPanel = ({
  pkg,
  onGenerateMode,
}: {
  pkg: DisputePackage;
  onGenerateMode: (
    mode: BuilderMode,
    options?: Record<string, unknown>,
  ) => void;
}) => {
  const [activeType, setActiveType] = useState<
    "factual" | "metro2" | "other" | "hybrid"
  >("factual");
  const [isRounds, setIsRounds] = useState(true);
  const [selectedSecondary, setSelectedSecondary] = useState<string>("innovis");
  const [aiTone, setAiTone] = useState<
    "concerned" | "annoyed" | "legal" | "firm"
  >("legal");

  // Reference UI dropdown selections
  const [letterTypeStyle, setLetterTypeStyle] =
    useState<LetterTypeStyle>("precision-attack");
  const [maxAccountsPerLetter, setMaxAccountsPerLetter] = useState("all");
  const [maxInquiriesPerLetter, setMaxInquiriesPerLetter] = useState("all");
  const [detailStyle, setDetailStyle] = useState<
    "advanced" | "summary" | "everything" | "basic"
  >("advanced");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [handwrittenLook, setHandwrittenLook] = useState(false);
  const [creditorLetterType, setCreditorLetterType] = useState("dtc");
  const [creditorContentMode, setCreditorContentMode] = useState<
    "same" | "different"
  >("same");
  const [selectedAlternateBureaus, setSelectedAlternateBureaus] = useState<
    string[]
  >(["Innovis", "LexisNexis"]);
  const secondary = SECONDARY_BUREAUS.find((b) => b.id === selectedSecondary);

  const toggleAltBureau = (bureauName: string) => {
    setSelectedAlternateBureaus((prev) =>
      prev.includes(bureauName)
        ? prev.filter((b) => b !== bureauName)
        : [...prev, bureauName],
    );
  };

  const handleBuildTrigger = (mode: BuilderMode) => {
    onGenerateMode(mode, {
      aiTone,
      selectedSecondary,
      isRounds,
      letterTypeStyle,
      maxAccountsPerLetter,
      maxInquiriesPerLetter,
      detailStyle,
      includeSignature,
      handwrittenLook,
      creditorLetterType,
      creditorContentMode,
      selectedAlternateBureaus,
    });
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold tracking-tight">
              Dispute Letters & Print
            </h2>
            <Badge
              variant="outline"
              className="bg-primary/5 text-primary border-primary/20"
            >
              4 Creation Pathways
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and print letters for active disputes. Select what type of
            letters you want to build before download or print.
          </p>
        </div>

        {/* Workflow indicator step chips */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">
            1. Build Letters
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground px-2 py-1">
            2. Pending Print
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground px-2 py-1">
            3. Active & Re-Print
          </span>
        </div>
      </div>

      <div className="text-center py-2">
        <h3 className="text-2xl font-bold text-foreground tracking-tight">
          What Type of Letters do you want to Build?
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          If you need to build multiple "types" of letters, you can come back
          here to build more before you download or print.
        </p>
      </div>

      {/* Main 3 Letter Builder Section Cards (Matching Reference Screenshot) */}
      <div className="space-y-4">
        {/* CARD 1: FACTUAL DISPUTE LETTERS */}
        <div
          className={`rounded-xl border-2 transition-all overflow-hidden ${
            activeType === "factual"
              ? "border-sky-500 bg-sky-500/5 shadow-md"
              : "border-sky-200 dark:border-sky-900/40 bg-card hover:border-sky-300"
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 items-center p-5 gap-4">
            <div className="md:col-span-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-sky-500/10 text-sky-600">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-sky-900 dark:text-sky-300">
                  Factual
                </h4>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Dispute Letters
                </p>
              </div>
            </div>

            <div className="md:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-background/80 p-3 rounded-lg border border-border">
                <p className="font-semibold text-xs text-foreground">
                  Standard "Rounds" Letters
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Build letters, then close & increment round after mailing.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveType("factual");
                    setIsRounds(true);
                    handleBuildTrigger("factual");
                  }}
                  className="mt-2 w-full bg-sky-600 hover:bg-sky-700 text-white text-xs h-8"
                >
                  Build Rounds Letters <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>

              <div className="bg-background/80 p-3 rounded-lg border border-border">
                <p className="font-semibold text-xs text-foreground">
                  "Anytime" Letters
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Build mid-round without closing the active round.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveType("factual");
                    setIsRounds(false);
                    handleBuildTrigger("interim");
                  }}
                  className="mt-2 w-full border-sky-300 text-sky-700 hover:bg-sky-50 text-xs h-8"
                >
                  Build Anytime <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>

            <div className="md:col-span-3 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-4 text-center">
              <div className="flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-400">
                <PlayCircle className="h-4 w-4" /> Factual Letters Explained
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                FCRA §1681i evidence-grounded factual inquiry
              </p>
            </div>
          </div>
        </div>

        {/* CARD 2: METRO2 DISPUTE LETTERS */}
        <div
          className={`rounded-xl border-2 transition-all overflow-hidden ${
            activeType === "metro2"
              ? "border-purple-500 bg-purple-500/5 shadow-md"
              : "border-purple-200 dark:border-purple-900/40 bg-card hover:border-purple-300"
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 items-center p-5 gap-4">
            <div className="md:col-span-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600">
                <Layers className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-purple-900 dark:text-purple-300">
                    Metro2
                  </h4>
                  <Badge className="bg-purple-600 text-white text-[10px] uppercase">
                    Audit Mode
                  </Badge>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Dispute Letters
                </p>
              </div>
            </div>

            <div className="md:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-background/80 p-3 rounded-lg border border-border">
                <p className="font-semibold text-xs text-foreground">
                  Standard "Rounds" Letters
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Build Metro2 compliance audit letters for active round.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveType("metro2");
                    setIsRounds(true);
                    handleBuildTrigger("metro2");
                  }}
                  className="mt-2 w-full bg-purple-600 hover:bg-purple-700 text-white text-xs h-8"
                >
                  Build Metro2 Letters <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>

              <div className="bg-background/80 p-3 rounded-lg border border-border">
                <p className="font-semibold text-xs text-foreground">
                  "Anytime" Letters
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Direct furnisher Metro2 audit mid-round.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveType("metro2");
                    setIsRounds(false);
                    handleBuildTrigger("metro2");
                  }}
                  className="mt-2 w-full border-purple-300 text-purple-700 hover:bg-purple-50 text-xs h-8"
                >
                  Build Anytime <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>

            <div className="md:col-span-3 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-4 text-center">
              <div className="flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400">
                <PlayCircle className="h-4 w-4" /> Metro2 Audit Explained
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Field-level anomaly audit & furnisher duties
              </p>
            </div>
          </div>
        </div>

        {/* CARD 3: OTHER / ALTERNATE BUREAUS & FREEZE */}
        <div
          className={`rounded-xl border-2 transition-all overflow-hidden ${
            activeType === "other"
              ? "border-rose-500 bg-rose-500/5 shadow-md"
              : "border-rose-200 dark:border-rose-900/40 bg-card hover:border-rose-300"
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 items-center p-5 gap-4">
            <div className="md:col-span-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-rose-900 dark:text-rose-300">
                  Other / Secondary
                </h4>
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Dispute & Freeze Letters
                </p>
              </div>
            </div>

            <div className="md:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-background/80 p-3 rounded-lg border border-border">
                <p className="font-semibold text-xs text-foreground">
                  Alternate Bureau Letters
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Dispute directly with Innovis, LexisNexis, ChexSystems, CFPB.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveType("other");
                    handleBuildTrigger("secondary");
                  }}
                  className="mt-2 w-full bg-rose-600 hover:bg-rose-700 text-white text-xs h-8"
                >
                  Build Alternate Bureaus{" "}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>

              <div className="bg-background/80 p-3 rounded-lg border border-border">
                <p className="font-semibold text-xs text-foreground">
                  Freeze / Suppression
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Send security freeze letters to all 6 secondary registries.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveType("other");
                    handleBuildTrigger("freeze");
                  }}
                  className="mt-2 w-full border-rose-300 text-rose-700 hover:bg-rose-50 text-xs h-8"
                >
                  Build Security Freeze <Snowflake className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>

            <div className="md:col-span-3 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-4 text-center">
              <div className="flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-400">
                <PlayCircle className="h-4 w-4" /> Freeze & Alternate Explained
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Secondary bureau suppression & dispute registry
              </p>
            </div>
          </div>
        </div>

        {/* CARD 4: HYBRID DISPUTE OPTION */}
        <div
          className={`rounded-xl border-2 transition-all overflow-hidden ${
            activeType === "hybrid"
              ? "border-emerald-500 bg-emerald-500/5 shadow-md"
              : "border-emerald-200 dark:border-emerald-900/40 bg-card hover:border-emerald-300"
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 items-center p-5 gap-4">
            <div className="md:col-span-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Sparkles className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-emerald-900 dark:text-emerald-300">
                    Hybrid
                  </h4>
                  <Badge className="bg-emerald-600 text-white text-[10px] uppercase">
                    Factual + Metro2
                  </Badge>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Combined Strategy
                </p>
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="bg-background/80 p-3 rounded-lg border border-border">
                <p className="font-semibold text-xs text-foreground">
                  Factual Facts + Metro2 Field Anomaly Package
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Combines consumer factual attestation with field-level data
                  integrity context in 1 unified letter package.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveType("hybrid");
                    handleBuildTrigger("hybrid");
                  }}
                  className="mt-2 w-full bg-gradient-emerald text-white text-xs h-8 hover:opacity-90"
                >
                  Build Hybrid Dispute Package{" "}
                  <Sparkles className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>

            <div className="md:col-span-3 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-4 text-center">
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" /> Truth Gate Protected
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Grounds evidence first before legal citation
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

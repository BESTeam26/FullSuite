/**
 * Status Guide Drawer / Modal for CreditOps Fulfillment Workspace
 * Displays the exact SOP status standards for Dispute, Support, Bureau Calling,
 * Complaints & Mailing, and Onboarding teams.
 */

import { useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import {
  CREDIT_OPS_STATUS_GUIDE,
  type StatusGuideItem,
} from "@/lib/fulfillment/creditops-status-guide";
import { cn } from "@/lib/utils";

interface StatusGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All Statuses" },
  { key: "dispute", label: "Dispute / Processing" },
  { key: "support", label: "Customer Support" },
  { key: "bureau", label: "Bureau Calling" },
  { key: "complaints", label: "Complaints & Mailing" },
  { key: "onboarding", label: "Onboarding" },
];

export function StatusGuideModal({ isOpen, onClose }: StatusGuideModalProps) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  if (!isOpen) return null;

  const filtered = CREDIT_OPS_STATUS_GUIDE.filter((item) => {
    if (activeTab !== "all" && item.category !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Status Guide — Processing & Support Statuses
              </h2>
              <p className="text-xs text-muted-foreground">
                Internal SOP status standards for CreditOps Agency Fulfillment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter bar & search */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 p-4">
          <div className="flex flex-wrap gap-1">
            {CATEGORY_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  activeTab === t.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search status code or SOP description..."
              className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Status List */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((item) => (
              <div
                key={item.code}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-tight",
                        item.badgeClass,
                      )}
                    >
                      {item.name}
                    </span>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                No statuses match your search
              </p>
              <p className="text-xs text-muted-foreground">
                Try searching for a different keyword or selecting "All
                Statuses".
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Total {CREDIT_OPS_STATUS_GUIDE.length} SOP status definitions
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-secondary px-4 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}

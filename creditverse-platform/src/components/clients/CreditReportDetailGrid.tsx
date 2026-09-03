// CreditReportDetailGrid — Displays side-by-side 3-bureau raw field comparison & payment grid
import { useState } from "react";
import {
  Building2,
  Clock,
  FileSearch,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ClassifiedItem, Bureau } from "@/lib/credit-classification";

const bureauHeaderBg: Record<Bureau, string> = {
  EQ: "bg-red-500/10 text-red-700 dark:text-red-300",
  EX: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  TU: "bg-emerald-500/10 text-status-success",
};

const bureauLabel: Record<Bureau, string> = {
  EQ: "Equifax",
  EX: "Experian",
  TU: "TransUnion",
};

function isDerog(status: string): boolean {
  const s = (status || "").toLowerCase();
  return (
    s.includes("collection") ||
    s.includes("charge") ||
    s.includes("derogatory") ||
    s.includes("late") ||
    s.includes("repossession") ||
    s.includes("foreclosure") ||
    s.includes("default") ||
    s.includes("bankrupt")
  );
}

export const CreditReportDetailGrid = ({
  item,
  round,
}: {
  item: ClassifiedItem;
  round: number;
}) => {
  const [showPaymentHistory, setShowPaymentHistory] = useState(true);
  const [showDisputeHistory, setShowDisputeHistory] = useState(true);

  const has = (b: Bureau) => item.bureaus.includes(b);
  const val = (b: Bureau, v: string, fallback = "-") => (has(b) ? v : fallback);

  const isCollection = item.category === "3rd-Party Collection";
  const isChargeOff = item.category === "Charge-Off";
  const isLate = item.category === "Late Payment";
  const isInquiry = item.kind === "Inquiry";
  const isPublic = item.kind === "Public Record";

  const fields = [
    {
      label: "Account Name",
      eq: val("EQ", item.name),
      ex: val("EX", item.name),
      tu: val("TU", item.name),
    },
    {
      label: "Account Number",
      eq: val("EQ", `****-****${item.id.slice(-4)}`),
      ex: val("EX", `****-****${item.id.slice(-4)}`),
      tu: val("TU", `****-****${item.id.slice(-4)}`),
    },
    {
      label: "Account Type",
      eq: val(
        "EQ",
        item.subtype || (isCollection ? "Collection" : "Revolving"),
      ),
      ex: val(
        "EX",
        item.subtype || (isCollection ? "Collection" : "Installment"),
      ),
      tu: val(
        "TU",
        item.subtype || (isCollection ? "Collection" : "Revolving"),
      ),
    },
    {
      label: "Account Type Detail",
      eq: "-",
      ex: val(
        "EX",
        item.kind === "Account" ? "Unsecured Loan / Credit Card" : "-",
      ),
      tu: "-",
    },
    {
      label: "Monthly Payment",
      eq: val("EQ", "$0"),
      ex: val("EX", "$0"),
      tu: val("TU", "$0"),
    },
    {
      label: "Date Opened",
      eq: val("EQ", item.openDate || "06/17/2026"),
      ex: val("EX", item.openDate || "06/17/2026"),
      tu: val("TU", item.openDate || "06/17/2026"),
    },
    { label: "Date Closed", eq: "-", ex: "-", tu: "-" },
    {
      label: "Balance",
      eq: val("EQ", item.balance || "$0"),
      ex: val("EX", item.balance || "$0"),
      tu: val("TU", item.balance || "$0"),
    },
    { label: "Terms", eq: "-", ex: val("EX", "12 Mos"), tu: "-" },
    {
      label: "High Balance",
      eq: val("EQ", item.balance || "$0"),
      ex: val("EX", item.balance || "$0"),
      tu: val("TU", item.balance || "$0"),
    },
    {
      label: "Status",
      eq: val("EQ", item.status),
      ex: val("EX", item.status),
      tu: val("TU", item.status),
    },
    {
      label: "Payment Frequency",
      eq: "-",
      ex: val("EX", "Monthly"),
      tu: "-",
    },
    {
      label: "Dispute Status",
      eq: val("EQ", "Account not disputed"),
      ex: val("EX", "Account not disputed"),
      tu: val("TU", "Account not disputed"),
    },
    {
      label: "Creditor Type",
      eq: "-",
      ex: val(
        "EX",
        isCollection
          ? "Other Collection Agencies"
          : isChargeOff
            ? "Credit Card Issuer"
            : "Creditor",
      ),
      tu: "-",
    },
    {
      label: "Account Description",
      eq: val("EQ", "Individual"),
      ex: val("EX", "Individual"),
      tu: val("TU", "Individual"),
    },
    {
      label: "Account Rating",
      eq: val("EQ", isDerog(item.status) ? "Derog" : "OK"),
      ex: val("EX", isDerog(item.status) ? "Derog" : "OK"),
      tu: val("TU", isDerog(item.status) ? "Derog" : "OK"),
    },
    {
      label: "Original Creditor",
      eq: "-",
      ex: val("EX", isCollection ? "CREDIT ONE BANK N.A." : "-"),
      tu: "-",
    },
    {
      label: "Account Status",
      eq: val("EQ", isDerog(item.status) ? "Derog" : item.status),
      ex: val("EX", isDerog(item.status) ? "Derog" : item.status),
      tu: val("TU", isDerog(item.status) ? "Derog" : item.status),
    },
    {
      label: "Bureau Code",
      eq: val("EQ", "Individual"),
      ex: val("EX", "Individual"),
      tu: val("TU", "Individual"),
    },
    {
      label: "Start Date",
      eq: "-",
      ex: val("EX", item.openDate || "08/24/2026"),
      tu: "-",
    },
    {
      label: "Limit",
      eq: "-",
      ex: val("EX", "$0"),
      tu: "-",
    },
    {
      label: "Past Due",
      eq: "-",
      ex: val("EX", item.balance || "$0"),
      tu: "-",
    },
    {
      label: "Payment Status",
      eq: "-",
      ex: val(
        "EX",
        isCollection
          ? "Collection/Chargeoff"
          : isChargeOff
            ? "Charge-Off"
            : item.status,
      ),
      tu: "-",
    },
    {
      label: "Last Activity",
      eq: "-",
      ex: val("EX", "08/04/2026"),
      tu: "-",
    },
    {
      label: "Past Due - 30 Days",
      eq: "-",
      ex: val("EX", isLate ? "2" : "0"),
      tu: "-",
    },
    {
      label: "Past Due - 60 Days",
      eq: "-",
      ex: val("EX", isLate ? "1" : "0"),
      tu: "-",
    },
    {
      label: "Past Due - 90 Days",
      eq: "-",
      ex: val("EX", isChargeOff ? "1" : "0"),
      tu: "-",
    },
    {
      label: "Last Verified",
      eq: "-",
      ex: val("EX", "08/04/2026"),
      tu: "-",
    },
    {
      label: "Responsibility",
      eq: "-",
      ex: val("EX", "Individual"),
      tu: "-",
    },
    {
      label: "Last Reported",
      eq: val("EQ", "08/04/2026"),
      ex: val("EX", "08/04/2026"),
      tu: val("TU", "08/04/2026"),
    },
    {
      label: "Date Of Last Payment",
      eq: "-",
      ex: val("EX", "—"),
      tu: "-",
    },
    {
      label: "Comments / Remarks",
      eq: "-",
      ex: val(
        "EX",
        isCollection
          ? "Placed for collection"
          : isPublic
            ? "Public record item"
            : isInquiry
              ? "Records indicate inquiry"
              : item.remarks || "—",
      ),
      tu: "-",
    },
    {
      label: "Added In CRM",
      eq: "-",
      ex: val("EX", "08/24/2026"),
      tu: "-",
    },
  ];

  const payYears = ["2024", "2023", "2022"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const getPayCode = (year: string, monthIdx: number) => {
    if (
      item.category === "Charge-Off" ||
      item.category === "3rd-Party Collection"
    ) {
      if (year === "2024" && monthIdx < 7)
        return { code: "CO", cls: "bg-red-600 text-white font-bold" };
      if (year === "2023")
        return { code: "CO", cls: "bg-red-600 text-white font-bold" };
      return {
        code: "OK",
        cls: "bg-emerald-500/20 text-status-success font-semibold",
      };
    }
    if (item.category === "Late Payment") {
      if (year === "2024" && (monthIdx === 3 || monthIdx === 4))
        return { code: "90", cls: "bg-red-500 text-white font-bold" };
      if (year === "2023" && monthIdx === 0)
        return { code: "30", cls: "bg-amber-500 text-white font-semibold" };
      return {
        code: "OK",
        cls: "bg-emerald-500/20 text-status-success font-semibold",
      };
    }
    return {
      code: "OK",
      cls: "bg-emerald-500/20 text-status-success font-semibold",
    };
  };

  return (
    <div className="space-y-4 mt-3">
      {/* 3-Bureau Detailed Report Comparison (Single Unified Table) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-status-success" />
            3-Bureau Detailed Report Comparison
          </h4>
          <span className="text-[11px] text-muted-foreground">
            Original Source Data Parsed
          </span>
        </div>

        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <div className="grid grid-cols-4 bg-muted/60 p-2.5 text-center text-xs font-bold border-b border-border">
            <span className="text-left text-muted-foreground">Field</span>
            <span className="text-status-danger">Equifax</span>
            <span className="text-status-info">Experian</span>
            <span className="text-status-success">Transunion</span>
          </div>
          <div className="divide-y divide-border text-xs">
            {fields.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-4 p-2.5 hover:bg-muted/20 items-center"
              >
                <span className="font-semibold text-muted-foreground truncate">
                  {row.label}
                </span>
                <span className="text-center font-mono text-[11px]">
                  {row.eq}
                </span>
                <span className="text-center font-mono text-[11px] text-foreground font-semibold">
                  {row.ex}
                </span>
                <span className="text-center font-mono text-[11px]">
                  {row.tu}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setShowPaymentHistory((prev) => !prev)}
          className="flex w-full items-center justify-between bg-muted/40 p-3 text-xs font-bold text-foreground hover:bg-muted/60"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-status-success" />
            3-Year Payment History & Delinquency Record
          </span>
          {showPaymentHistory ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showPaymentHistory && (
          <div className="p-4 space-y-4">
            {item.bureaus.map((bureau) => (
              <div key={bureau} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${bureauHeaderBg[bureau]}`}
                  >
                    {bureauLabel[bureau]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Historical Monthly Status Codes
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-center border border-border rounded-lg text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border text-[11px] text-muted-foreground">
                        <th className="p-1.5 text-left font-semibold">Year</th>
                        {months.map((m) => (
                          <th key={m} className="p-1.5 font-semibold">
                            {m}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payYears.map((yr) => (
                        <tr
                          key={yr}
                          className="border-b border-border/50 hover:bg-muted/10"
                        >
                          <td className="p-1.5 font-bold font-mono text-left">
                            {yr}
                          </td>
                          {months.map((m, mIdx) => {
                            const res = getPayCode(yr, mIdx);
                            return (
                              <td key={m} className="p-1">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${res.cls}`}
                                >
                                  {res.code}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historical Disputes Log */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setShowDisputeHistory((prev) => !prev)}
          className="flex w-full items-center justify-between bg-muted/40 p-3 text-xs font-bold text-foreground hover:bg-muted/60"
        >
          <span className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-status-info" />
            Historical Dispute Rounds & Result Log
          </span>
          {showDisputeHistory ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showDisputeHistory && (
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left text-xs border border-border rounded-lg">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-[11px] text-muted-foreground">
                  <th className="p-2 font-semibold">Dispute Sent Date</th>
                  <th className="p-2 font-semibold">Sent To</th>
                  <th className="p-2 font-semibold">Letter Status</th>
                  <th className="p-2 font-semibold">Result</th>
                  <th className="p-2 font-semibold">Dispute Status</th>
                  <th className="p-2 font-semibold">Result Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/20">
                  <td className="p-2 font-mono text-status-success">
                    August 24th, 2026
                  </td>
                  <td className="p-2 font-semibold">Experian (Upload)</td>
                  <td className="p-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] text-status-success"
                    >
                      Active
                    </Badge>
                  </td>
                  <td className="p-2 font-medium text-status-warning">
                    In Dispute
                  </td>
                  <td className="p-2 font-medium">In Dispute</td>
                  <td className="p-2 text-muted-foreground">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

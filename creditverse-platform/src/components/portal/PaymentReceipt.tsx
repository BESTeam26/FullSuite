/**
 * A receipt for one payment, from the payment record itself (Dee, 2026-10-01
 * doctrine: Billing shows "receipts").
 *
 * Not a second record: every line is the canonical payment the partner's own
 * function returned. BES emails the same receipt when the payment is recorded
 * (queue_payment_receipt); this is the copy they can open and print any time.
 * Print shows the receipt alone — the `printing-receipt` rule in index.css.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import type { PortalPayment } from "@/lib/data/portal-billing";

export function PaymentReceipt({ payment, partnerName, onClose }: {
  payment: PortalPayment; partnerName: string; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const afterPrint = () => document.body.classList.remove("printing-receipt");
    window.addEventListener("keydown", onKey);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("afterprint", afterPrint);
      document.body.classList.remove("printing-receipt");
    };
  }, [onClose]);

  const print = () => {
    document.body.classList.add("printing-receipt");
    window.print();
  };

  const rows: [string, string][] = [
    ["Received from", partnerName],
    ["Amount", formatMoneyIn(payment.amountCents / 100, payment.currency)],
    ["Date received", formatDate(payment.paidOn)],
    ...(payment.method ? [["Method", payment.method] as [string, string]] : []),
    ...(payment.invoiceNumber ? [["Applied to invoice", payment.invoiceNumber] as [string, string]] : []),
    ...(payment.reference ? [["Reference", payment.reference] as [string, string]] : []),
    ["Status", payment.status === "refunded" ? "Refunded" : "Received"],
  ];

  return createPortal(
    <div id="bes-receipt" role="dialog" aria-modal="true" aria-label="Payment receipt" onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 print:static print:bg-white print:p-0">
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 text-foreground shadow-2xl print:max-w-none print:shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Payment receipt</p>
            <p className="mt-0.5 text-lg font-bold">Blessed Empire Services</p>
          </div>
          <div className="flex gap-1 print:hidden">
            <button type="button" onClick={print} aria-label="Print or save as PDF"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Printer className="h-3.5 w-3.5" aria-hidden /> Print
            </button>
            <button type="button" onClick={onClose} aria-label="Close"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-border/60 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Calculated from the payment recorded on your account. Questions: message BES from Billing in your portal.
        </p>
      </div>
    </div>,
    document.body,
  );
}

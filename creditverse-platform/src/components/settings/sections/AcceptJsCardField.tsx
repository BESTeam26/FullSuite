/**
 * The card field — Authorize.Net's Accept.js, not ours.
 *
 * This component collects a card number and never lets it leave the browser
 * for anywhere except Authorize.Net. `Accept.dispatchData` posts the fields
 * directly to the processor and returns an opaque nonce; the inputs are
 * uncontrolled and their values are read once, at submit, straight into that
 * call. Nothing is put in React state, nothing is logged, and nothing is sent
 * to any BES endpoint.
 *
 * The script is loaded from Authorize.Net's own domain, which is a
 * requirement of the integration and also the point: the code that touches the
 * card is theirs.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

const SCRIPT_ID = "authorize-net-accept-js";
const SRC = {
  production: "https://js.authorize.net/v1/Accept.js",
  sandbox: "https://jstest.authorize.net/v1/Accept.js",
};

interface AcceptResponse {
  messages: { resultCode: string; message: { code: string; text: string }[] };
  opaqueData?: { dataDescriptor: string; dataValue: string };
}
declare global {
  interface Window {
    Accept?: { dispatchData: (data: unknown, callback: (r: AcceptResponse) => void) => void };
  }
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function AcceptJsCardField({
  apiLoginId,
  clientKey,
  environment,
  onToken,
}: {
  apiLoginId: string;
  clientKey: string;
  environment: "production" | "sandbox";
  onToken: (opaqueData: { dataDescriptor: string; dataValue: string }) => Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const number = useRef<HTMLInputElement>(null);
  const month = useRef<HTMLInputElement>(null);
  const year = useRef<HTMLInputElement>(null);
  const cvv = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      /* Already loaded by another visit to this screen. */
      if (window.Accept) setReady(true);
      else existing.addEventListener("load", () => setReady(true), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SRC[environment];
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError("Authorize.Net's card library could not be loaded.");
    document.body.appendChild(script);
  }, [environment]);

  const submit = () => {
    if (!window.Accept) {
      setError("The card library is not ready yet.");
      return;
    }
    setBusy(true);
    setError(null);
    window.Accept.dispatchData(
      {
        authData: { clientKey, apiLoginID: apiLoginId },
        cardData: {
          /* Read once, passed straight out. Never stored, never in state. */
          cardNumber: number.current?.value.replace(/\s+/g, "") ?? "",
          month: month.current?.value ?? "",
          year: year.current?.value ?? "",
          cardCode: cvv.current?.value ?? "",
        },
      },
      (response) => {
        if (response.messages.resultCode !== "Ok" || !response.opaqueData) {
          setBusy(false);
          setError(response.messages.message?.[0]?.text ?? "The card was not accepted.");
          return;
        }
        /* Clear the inputs the moment the nonce exists: the number has done
           its job and there is no reason for it to stay on screen. */
        [number, month, year, cvv].forEach((r) => {
          if (r.current) r.current.value = "";
        });
        void onToken(response.opaqueData).finally(() => setBusy(false));
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block sm:col-span-4">
          <span className={labelCls}>Card number</span>
          <input ref={number} className={inputCls} inputMode="numeric" autoComplete="cc-number" placeholder="•••• •••• •••• ••••" />
        </label>
        <label className="block">
          <span className={labelCls}>Month</span>
          <input ref={month} className={inputCls} inputMode="numeric" maxLength={2} autoComplete="cc-exp-month" placeholder="MM" />
        </label>
        <label className="block">
          <span className={labelCls}>Year</span>
          <input ref={year} className={inputCls} inputMode="numeric" maxLength={4} autoComplete="cc-exp-year" placeholder="YYYY" />
        </label>
        <label className="block">
          <span className={labelCls}>CVV</span>
          <input ref={cvv} className={inputCls} inputMode="numeric" maxLength={4} autoComplete="cc-csc" placeholder="•••" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      )}
      <Button type="button" size="sm" onClick={submit} disabled={!ready || busy}>
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CreditCard className="mr-1 h-3.5 w-3.5" />}
        {ready ? "Save card" : "Loading the card library…"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        The number goes from this field straight to Authorize.Net. BES never receives it, never logs it,
        and the database has no column that could hold it.
      </p>
    </div>
  );
}

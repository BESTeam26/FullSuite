import { Link } from "react-router-dom";
import {
  ShieldCheck,
  ArrowLeft,
  BookOpen,
  ScanSearch,
  FileCheck2,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/lib/use-seo";
import { SampleContentNotice } from "@/components/dashboard/SampleContentNotice";

const steps = [
  {
    n: 1,
    label: "Learn",
    icon: BookOpen,
    desc: "Understand your report and what's accurate vs. inaccurate.",
  },
  {
    n: 2,
    label: "Review",
    icon: ScanSearch,
    desc: "See a field-level comparison across all three bureaus.",
  },
  {
    n: 3,
    label: "Verify",
    icon: ShieldCheck,
    desc: "Confirm the facts yourself — only you know what's true.",
  },
  {
    n: 4,
    label: "Document",
    icon: FileCheck2,
    desc: "Attach evidence that supports what you're stating.",
  },
  {
    n: 5,
    label: "Decide",
    icon: Trophy,
    desc: "Choose what to dispute and approve your own communication.",
  },
];

const reviewSummary = [
  { label: "items look consistent", value: 18, tone: "emerald" },
  { label: "items need your review", value: 4, tone: "amber" },
  { label: "items have supporting evidence", value: 2, tone: "sky" },
];

const reviewCards = [
  {
    name: "ACME BANK",
    experian: "$4,820",
    equifax: "$4,820",
    transunion: "$0",
    field: "balance",
  },
];

const Portal = () => {
  const [attested, setAttested] = useState(false);
  useSeo({
    title: "Consumer Portal — BES",
    description: "Consumer credit portal.",
    canonical: "/portal",
    noindex: true,
  });
  return (
    <div className="min-h-screen bg-gradient-navy text-white">
      <SampleContentNotice what="This is a preview of the client portal with example data. Real client portals open from a client's own sign-in." />
      <header className="border-b border-white/10">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-emerald text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-semibold">Apex Credit Academy</span>
            <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
              Powered by BES
            </span>
          </div>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>
        </div>
      </header>

      <main className="container py-12">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Your credit, your facts, your call
          </h1>
          <p className="mt-4 text-slate-300">
            This is your consumer workspace. You review your report, verify what
            you know is true, attach evidence, and approve your own
            communication. No one disputes on your behalf without your say.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-5">
            {steps.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                  <s.icon className="h-4 w-4" />
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  Step {s.n}
                </p>
                <p className="mt-1 font-semibold">{s.label}</p>
                <p className="mt-1 text-xs text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold">Your Credit Accuracy Review</h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {reviewSummary.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-navy-deep p-4"
              >
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="mt-1 text-sm text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-4xl space-y-4">
          {reviewCards.map((c) => (
            <div
              key={c.name}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <p className="font-semibold">{c.name}</p>
              <p className="mt-1 text-sm text-slate-300">
                Your reports do not agree on {c.field}.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-navy-deep p-3">
                  <p className="text-xs text-slate-400">Experian</p>
                  <p className="mt-1 font-semibold">{c.experian}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-navy-deep p-3">
                  <p className="text-xs text-slate-400">Equifax</p>
                  <p className="mt-1 font-semibold">{c.equifax}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-navy-deep p-3">
                  <p className="text-xs text-slate-400">TransUnion</p>
                  <p className="mt-1 font-semibold">{c.transunion}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-300">
                Is one of these values inaccurate?
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button disabled title="Sample content — this action connects when the live data model behind it exists" className="rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                  Yes, review this
                </button>
                <button disabled title="Sample content — this action connects when the live data model behind it exists" className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10">
                  I'm not sure
                </button>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-sm text-emerald-300">
                <BookOpen className="h-4 w-4" /> Learn first: Why bureaus may
                differ →
              </p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold">Your attestation</h2>
          <p className="mt-2 text-sm text-slate-300">
            By attesting, you confirm the facts you've stated are true to the
            best of your knowledge. Your approval is required before anything is
            sent on your behalf.
          </p>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-navy-deep p-4">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-500"
            />
            <span className="text-sm text-slate-300">
              I have reviewed the information above and confirm these facts are
              accurate. I approve preparation of my dispute communication for my
              final review before it is sent.
            </span>
          </label>
          <Button
            disabled={!attested}
            className="mt-4 w-full bg-gradient-emerald text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Prepare my dispute for final review
          </Button>
        </div>

        <p className="mx-auto mt-8 max-w-4xl text-center text-xs text-slate-500">
          BES is a software and education platform, not a law firm. This is not
          legal advice.
        </p>
      </main>
    </div>
  );
};

export default Portal;

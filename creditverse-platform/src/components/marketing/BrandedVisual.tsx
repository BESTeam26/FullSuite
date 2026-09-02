import type { ReactNode } from "react";
import {
  ShieldCheck,
  Banknote,
  User,
  Workflow,
  Layers,
  TrendingUp,
  FileText,
  CheckCircle2,
} from "lucide-react";

/**
 * Pure CSS/SVG branded visuals — no external images.
 * Abstract, on-brand dashboard mockups built from the design system.
 */

type Variant =
  | "hero"
  | "creditops"
  | "fundingops"
  | "diy"
  | "fullsuite"
  | "crm"
  | "ecosystem"
  | "team";

export const BrandedVisual = ({
  variant,
  className = "",
}: {
  variant: Variant;
  className?: string;
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-charcoal to-[#1a1d1f] shadow-2xl ${className}`}
    >
      <div className="absolute inset-0 grid-pattern opacity-[0.05]" />
      <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-emerald-700/10 blur-3xl" />
      <div className="relative p-6">
        {variant === "hero" && <HeroMock />}
        {variant === "creditops" && <CreditOpsMock />}
        {variant === "fundingops" && <FundingOpsMock />}
        {variant === "diy" && <DiyMock />}
        {variant === "fullsuite" && <FullSuiteMock />}
        {variant === "crm" && <CrmMock />}
        {variant === "ecosystem" && <EcosystemMock />}
        {variant === "team" && <TeamMock />}
      </div>
    </div>
  );
};

/* ---------- Shared sub-pieces ---------- */

const WinChrome = () => (
  <div className="mb-4 flex items-center gap-1.5">
    <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
    <span className="ml-3 text-[10px] font-medium uppercase tracking-widest text-slate-500">
      BES Workspace
    </span>
  </div>
);

const ScoreRing = ({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) => (
  <div className="flex flex-col items-center">
    <div className="relative h-16 w-16">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-white/10"
        />
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={163.36}
          strokeDashoffset={163.36 - (163.36 * value) / 850}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
        {value}
      </span>
    </div>
    <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {label}
    </span>
  </div>
);

const MiniBar = ({
  label,
  pct,
  color = "bg-amber-400",
}: {
  label: string;
  pct: number;
  color?: string;
}) => (
  <div>
    <div className="flex items-center justify-between text-[10px] text-slate-400">
      <span>{label}</span>
      <span>{pct}%</span>
    </div>
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  </div>
);

const Pill = ({
  children,
  tone = "gold",
}: {
  children: ReactNode;
  tone?: "gold" | "green" | "red" | "slate";
}) => {
  const tones = {
    gold: "bg-amber-400/15 text-amber-300 border-amber-400/20",
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
    red: "bg-red-400/15 text-red-300 border-red-400/20",
    slate: "bg-white/10 text-slate-300 border-white/15",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

/* ---------- Variants ---------- */

const HeroMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-300">
            Operations Today
          </p>
          <Pill tone="green">
            <CheckCircle2 className="h-2.5 w-2.5" /> Live
          </Pill>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { n: "42", l: "Need Review", c: "text-amber-300" },
            { n: "18", l: "Await Consumer", c: "text-slate-300" },
            { n: "31", l: "Ready for QA", c: "text-emerald-300" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-lg border border-white/10 bg-charcoal/40 p-2.5"
            >
              <p className={`text-xl font-black ${s.c}`}>{s.n}</p>
              <p className="text-[10px] text-slate-400">{s.l}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {[
            "Portfolio Recovery — Round 2",
            "LVNV Funding — MOV Request",
            "Capital One — Furnisher Dispute",
          ].map((t, i) => (
            <div
              key={t}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="flex-1 text-[11px] text-slate-300">{t}</span>
              <Pill tone={i === 0 ? "gold" : "slate"}>
                {i === 0 ? "QA" : i === 1 ? "Mailed" : "Draft"}
              </Pill>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold text-slate-300">Score Movement</p>
        <div className="mt-3 flex justify-between">
          <ScoreRing value={624} label="EQ" color="#D64545" />
          <ScoreRing value={643} label="EX" color="#3B82F6" />
          <ScoreRing value={618} label="TU" color="#005F4B" />
        </div>
        <div className="mt-4 space-y-2">
          <MiniBar label="Payment History" pct={78} />
          <MiniBar label="Utilization" pct={42} color="bg-emerald-400" />
          <MiniBar label="Credit Age" pct={60} color="bg-blue-400" />
        </div>
      </div>
    </div>
  </div>
);

const CreditOpsMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold">CreditOps</p>
        <p className="text-[10px] text-slate-400">
          Dispute operations workspace
        </p>
      </div>
    </div>
    <div className="mt-4 space-y-2">
      {[
        { n: "John D.", s: "Round 2 — MOV", t: "gold" as const, d: "Today" },
        { n: "Maria T.", s: "Round 1 — TRAP", t: "green" as const, d: "1 day" },
        {
          n: "Kevin M.",
          s: "Reimport — 7 deleted",
          t: "gold" as const,
          d: "2 days",
        },
      ].map((r) => (
        <div
          key={r.n}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
        >
          <div>
            <p className="text-xs font-semibold text-slate-200">{r.n}</p>
            <p className="text-[10px] text-slate-400">{r.s}</p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={r.t}>{r.d}</Pill>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-lg font-black text-amber-300">96.2%</p>
        <p className="text-[10px] text-slate-400">QA pass rate</p>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-lg font-black text-emerald-300">724</p>
        <p className="text-[10px] text-slate-400">Active clients</p>
      </div>
    </div>
  </div>
);

const FundingOpsMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
        <Banknote className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold">FundingOps</p>
        <p className="text-[10px] text-slate-400">Deal pipeline</p>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-4 gap-2">
      {[
        { s: "Readiness", n: 12, c: "text-slate-300" },
        { s: "Submitted", n: 8, c: "text-amber-300" },
        { s: "Conditions", n: 5, c: "text-blue-300" },
        { s: "Funded", n: 3, c: "text-emerald-300" },
      ].map((col) => (
        <div
          key={col.s}
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-center"
        >
          <p className={`text-lg font-black ${col.c}`}>{col.n}</p>
          <p className="text-[9px] text-slate-400">{col.s}</p>
        </div>
      ))}
    </div>
    <div className="mt-4 space-y-2">
      {[
        { b: "Apex Logistics", a: "$150K", st: "Submitted" },
        { b: "Blue Ridge Co.", a: "$75K", st: "Funded" },
      ].map((d) => (
        <div
          key={d.b}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
        >
          <div>
            <p className="text-xs font-semibold text-slate-200">{d.b}</p>
            <p className="text-[10px] text-slate-400">{d.a} requested</p>
          </div>
          <Pill tone={d.st === "Funded" ? "green" : "gold"}>{d.st}</Pill>
        </div>
      ))}
    </div>
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
      <TrendingUp className="h-4 w-4 text-emerald-300" />
      <p className="text-[11px] text-emerald-200">$1.2M funded this quarter</p>
    </div>
  </div>
);

const DiyMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-400/15 text-blue-300">
        <User className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold">My Credit Journey</p>
        <p className="text-[10px] text-slate-400">Consumer portal</p>
      </div>
    </div>
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold text-slate-300">
        Your Credit Accuracy Review
      </p>
      <div className="mt-3 flex gap-4">
        <ScoreRing value={643} label="Current" color="#EBAA15" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="flex items-center gap-2 text-[11px]">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-300">18 items consistent</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-400" />
            <span className="text-slate-300">4 items need review</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <FileText className="h-3.5 w-3.5 text-blue-300" />
            <span className="text-slate-300">2 items with evidence</span>
          </div>
        </div>
      </div>
    </div>
    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
      <p className="text-[11px] text-amber-200">
        ACME Bank — reports don't agree on balance. Is this accurate?
      </p>
      <div className="mt-2 flex gap-2">
        <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-300">
          Yes, review
        </span>
        <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-slate-300">
          Not sure
        </span>
      </div>
    </div>
  </div>
);

const FullSuiteMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="flex items-center justify-center">
      <div className="rounded-xl bg-gradient-to-r from-amber-500/20 to-emerald-700/20 px-4 py-2 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
          Full Suite
        </p>
        <p className="text-[10px] text-slate-300">One Client 360</p>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
        <ShieldCheck className="h-5 w-5 text-amber-300" />
        <p className="mt-2 text-xs font-semibold">CreditOps</p>
        <div className="mt-2 space-y-1.5">
          <MiniBar label="Disputes" pct={72} />
          <MiniBar label="Deletions" pct={58} color="bg-emerald-400" />
        </div>
      </div>
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <Banknote className="h-5 w-5 text-emerald-300" />
        <p className="mt-2 text-xs font-semibold">FundingOps</p>
        <div className="mt-2 space-y-1.5">
          <MiniBar label="Submitted" pct={64} color="bg-emerald-400" />
          <MiniBar label="Funded" pct={38} color="bg-amber-400" />
        </div>
      </div>
    </div>
    <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <span className="text-[10px] text-slate-400">Maria T.</span>
      <span className="text-slate-500">→</span>
      <Pill tone="gold">Credit</Pill>
      <span className="text-slate-500">→</span>
      <Pill tone="green">Funding</Pill>
    </div>
  </div>
);

const CrmMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-400/15 text-slate-300">
        <Workflow className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold">BES CRM</p>
        <p className="text-[10px] text-slate-400">Front-office layer</p>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-4 gap-2">
      {["New", "Contacted", "Qualified", "Won"].map((s, i) => (
        <div
          key={s}
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-center"
        >
          <p
            className={`text-lg font-black ${i === 3 ? "text-emerald-300" : "text-slate-300"}`}
          >
            {[24, 12, 7, 3][i]}
          </p>
          <p className="text-[9px] text-slate-400">{s}</p>
        </div>
      ))}
    </div>
    <div className="mt-4 space-y-2">
      {[
        { a: "SMS automation", s: "Active" },
        { a: "Email sequence", s: "Active" },
        { a: "Appointment booking", s: "Connected" },
      ].map((r) => (
        <div
          key={r.a}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
        >
          <span className="text-[11px] text-slate-300">{r.a}</span>
          <Pill tone="green">{r.s}</Pill>
        </div>
      ))}
    </div>
  </div>
);

const EcosystemMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="flex flex-col items-center">
      <div className="rounded-xl bg-gradient-to-r from-amber-500/20 to-emerald-700/20 px-6 py-2 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
          BES
        </p>
        <p className="text-[10px] text-slate-300">The Connected Platform</p>
      </div>
      <div className="my-3 h-6 w-px bg-white/15" />
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            icon: ShieldCheck,
            n: "CreditOps",
            c: "text-amber-300 bg-amber-400/10",
          },
          {
            icon: Banknote,
            n: "FundingOps",
            c: "text-emerald-300 bg-emerald-500/10",
          },
          { icon: User, n: "DIY Credit", c: "text-blue-300 bg-blue-400/10" },
        ].map((m) => (
          <div
            key={m.n}
            className="flex flex-col items-center rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.c}`}
            >
              <m.icon className="h-4 w-4" />
            </div>
            <p className="mt-1.5 text-[10px] font-medium text-slate-300">
              {m.n}
            </p>
          </div>
        ))}
      </div>
      <div className="my-3 h-6 w-px bg-white/15" />
      <div className="grid grid-cols-2 gap-2 w-full">
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-2.5 text-center">
          <Workflow className="mx-auto h-4 w-4 text-slate-400" />
          <p className="mt-1 text-[10px] text-slate-400">BES CRM</p>
        </div>
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-center">
          <Layers className="mx-auto h-4 w-4 text-amber-300" />
          <p className="mt-1 text-[10px] text-amber-300">Full Suite</p>
        </div>
      </div>
    </div>
  </div>
);

const TeamMock = () => (
  <div className="text-white">
    <WinChrome />
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold text-slate-300">Fulfillment Team</p>
        <div className="mt-3 flex -space-x-2">
          {["bg-amber-400", "bg-emerald-500", "bg-blue-400", "bg-red-400"].map(
            (c, i) => (
              <span
                key={i}
                className={`h-8 w-8 rounded-full border-2 border-charcoal ${c} flex items-center justify-center text-[10px] font-bold text-charcoal`}
              >
                {["M", "J", "K", "A"][i]}
              </span>
            ),
          )}
        </div>
        <p className="mt-3 text-[10px] text-slate-400">12 specialists online</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold text-slate-300">Activity</p>
        <div className="mt-3 space-y-2">
          {[
            { t: "QA approved", c: "text-emerald-300" },
            { t: "Letter mailed", c: "text-amber-300" },
            { t: "Reimport done", c: "text-blue-300" },
          ].map((a) => (
            <div key={a.t} className="flex items-center gap-2 text-[11px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${a.c.replace("text", "bg")}`}
              />
              <span className="text-slate-300">{a.t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
        <p className="text-[11px] text-emerald-200">
          One connected operation. No duplicate records.
        </p>
      </div>
    </div>
  </div>
);

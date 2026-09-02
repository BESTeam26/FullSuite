import { TrendingUp, Award, Target, Percent } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const monthly = [
  { m: "Mar", filed: 320, deleted: 110 },
  { m: "Apr", filed: 410, deleted: 165 },
  { m: "May", filed: 380, deleted: 190 },
  { m: "Jun", filed: 520, deleted: 240 },
  { m: "Jul", filed: 610, deleted: 310 },
  { m: "Aug", filed: 680, deleted: 380 },
];

const breakdown = [
  { name: "Late payments", value: 42, color: "#10B981" },
  { name: "Collections", value: 28, color: "#3B82F6" },
  { name: "Charge-offs", value: 18, color: "#F59E0B" },
  { name: "Inquiries", value: 12, color: "#8B5CF6" },
];

const kpis = [
  {
    label: "Deletion rate",
    value: "56%",
    icon: Percent,
    sub: "+4% vs last month",
  },
  {
    label: "Avg score lift",
    value: "+47",
    icon: TrendingUp,
    sub: "across portfolio",
  },
  { label: "Top agent", value: "S. Patel", icon: Award, sub: "312 deletions" },
  {
    label: "Response rate",
    value: "91%",
    icon: Target,
    sub: "bureau responses",
  },
];

const Reporting = () => (
  <div className="p-6 md:p-8">
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight">Reporting</h1>
      <p className="text-sm text-muted-foreground">
        Performance across your entire credit repair operation
      </p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
            <k.icon className="h-5 w-5" />
          </div>
          <p className="mt-4 text-2xl font-bold">{k.value}</p>
          <p className="text-sm text-muted-foreground">{k.label}</p>
          <p className="mt-1 text-xs text-emerald-600">{k.sub}</p>
        </div>
      ))}
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
        <h2 className="font-semibold">Filed vs deleted</h2>
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="m"
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="filed"
                stroke="#3B82F6"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="deleted"
                stroke="#10B981"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">Deletions by type</h2>
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {breakdown.map((b) => (
                  <Cell key={b.name} fill={b.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  </div>
);

export default Reporting;

import { Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { BES_PRODUCTS } from "@/lib/bes-products";

const cols = [
  {
    title: "Products",
    links: BES_PRODUCTS.map((p) => ({ label: p.name, to: `/${p.slug}` })),
  },
  {
    title: "Platform",
    links: [
      { label: "Ecosystem", to: "/#ecosystem" },
      { label: "Journeys", to: "/#journeys" },
      { label: "Pricing", to: "/#pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Credit Repair Software", to: "/credit-repair-software" },
      {
        label: "Funding Operations Software",
        to: "/funding-operations-software",
      },
      {
        label: "Credit + Funding Software",
        to: "/credit-repair-and-funding-software",
      },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "#" },
      { label: "Terms", to: "#" },
    ],
  },
];

export const Footer = () => (
  <footer className="border-t border-border bg-muted/30">
    <div className="container py-16">
      <div className="grid gap-10 md:grid-cols-5">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-gold text-charcoal">
              <Layers className="h-5 w-5" />
            </span>
            <span className="text-lg">BES</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            One connected operating ecosystem for credit repair and funding
            businesses. Start with what you need. Connect more as you grow.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-sm font-semibold">{c.title}</h4>
            <ul className="mt-4 space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 border-t border-border pt-8 text-sm text-muted-foreground">
        © {new Date().getFullYear()} BES. Credit + Funding Operations. Not legal
        advice.
      </div>
    </div>
  </footer>
);

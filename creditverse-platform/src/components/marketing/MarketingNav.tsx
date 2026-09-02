import { Link } from "react-router-dom";
import { Layers, Menu, X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BES_PRODUCTS } from "@/lib/bes-products";

const productLinks = BES_PRODUCTS.filter((p) => p.id !== "crm").map((p) => ({
  label: p.name,
  href: `/${p.slug}`,
  desc: p.tagline,
}));

const navLinks = [
  { label: "Platform", href: "#ecosystem" },
  { label: "Products", href: "#products", children: productLinks },
  { label: "Journeys", href: "#journeys" },
  { label: "Pricing", href: "#pricing" },
];

export const MarketingNav = () => {
  const [open, setOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <nav className="container flex h-16 items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-bold text-foreground"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-charcoal overflow-hidden border border-amber-500/30 shadow-sm">
            <img
              src="https://msgsndr-private.storage.googleapis.com/companyPhotos/c0e06640-1f70-4bac-8d43-133467d18455.png"
              alt="BES Logo"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            <Layers className="h-5 w-5 text-amber-400" />
          </div>
          <span className="text-xl tracking-tight font-black">BES</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) =>
            l.children ? (
              <div
                key={l.label}
                className="relative"
                onMouseEnter={() => setProductsOpen(true)}
                onMouseLeave={() => setProductsOpen(false)}
              >
                <a
                  href={l.href}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                  <ChevronDown className="h-3.5 w-3.5" />
                </a>
                {productsOpen && (
                  <div className="absolute left-0 top-full w-72 pt-2">
                    <div className="overflow-hidden rounded-xl border border-border bg-card p-2 shadow-elegant">
                      {l.children.map((c) => (
                        <a
                          key={c.href}
                          href={c.href}
                          className="block rounded-lg p-3 transition-colors hover:bg-muted"
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {c.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.desc}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ),
          )}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app">Sign in</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-gradient-gold text-charcoal hover:opacity-90"
          >
            <Link to="/app">Launch platform</Link>
          </Button>
        </div>

        <button
          className="md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-medium text-muted-foreground"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            {productLinks.map((p) => (
              <a
                key={p.href}
                href={p.href}
                className="pl-4 text-sm text-muted-foreground"
                onClick={() => setOpen(false)}
              >
                {p.label}
              </a>
            ))}
            <Button asChild className="mt-2 bg-gradient-gold text-charcoal">
              <Link to="/app">Launch platform</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};

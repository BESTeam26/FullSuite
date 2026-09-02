import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { ProductSelector } from "@/components/marketing/ProductSelector";
import { EcosystemSection } from "@/components/marketing/EcosystemSection";
import { JourneySection } from "@/components/marketing/JourneySection";
import { StandaloneConnected } from "@/components/marketing/StandaloneConnected";
import { AiPositioning } from "@/components/marketing/AiPositioning";
import { Pricing } from "@/components/marketing/Pricing";
import { TrustSection } from "@/components/marketing/TrustSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { CTA } from "@/components/marketing/CTA";
import { Footer } from "@/components/marketing/Footer";
import { useSeo, BASE_URL } from "@/lib/use-seo";

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BES",
  description:
    "One connected operating ecosystem for credit repair and funding businesses. CreditOps, FundingOps, DIY Credit, and CRM — each works independently and connects into one Full Suite.",
  url: BASE_URL,
  logo: `${BASE_URL}/favicon.svg`,
};

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "BES Platform",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "One connected operating system for credit repair and business funding. Start with CreditOps or FundingOps. Add DIY credit, operational intelligence, or the full suite as you grow.",
  offers: [
    {
      "@type": "Offer",
      name: "BES CreditOps",
      description: "Credit repair fulfillment & operations software.",
      url: `${BASE_URL}/creditops`,
    },
    {
      "@type": "Offer",
      name: "BES FundingOps",
      description: "Business funding operations software.",
      url: `${BASE_URL}/fundingops`,
    },
    {
      "@type": "Offer",
      name: "BES DIY Credit",
      description: "White-label consumer credit platform.",
      url: `${BASE_URL}/diy-credit`,
    },
    {
      "@type": "Offer",
      name: "BES CRM",
      description: "Front-office CRM & automation layer.",
      url: `${BASE_URL}/crm`,
    },
    {
      "@type": "Offer",
      name: "BES Full Suite",
      description: "Credit + Funding. One connected operation.",
      url: `${BASE_URL}/full-suite`,
    },
  ],
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: BASE_URL,
    },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is BES?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "BES is a connected operating ecosystem for credit repair and funding businesses. It includes CreditOps (credit repair operations), FundingOps (business funding operations), DIY Credit (white-label consumer portal), and a CRM layer. Each product works independently and connects into one Full Suite.",
      },
    },
    {
      "@type": "Question",
      name: "Do I have to buy the entire ecosystem on day one?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Start with the product your business needs today. Each works independently. Add more as you grow without rebuilding your operation.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use CreditOps without FundingOps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. CreditOps is a complete credit-repair operations product on its own. FundingOps is not required, and vice versa. A credit-only company and a funding-only company can each use BES independently.",
      },
    },
    {
      "@type": "Question",
      name: "Does credit improvement guarantee funding approval?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Credit improvement does not guarantee funding. The funding-readiness review may identify credit or other readiness factors requiring attention. Other blockers may include revenue, time in business, banking, documents, debt, entity, ownership, or industry fit.",
      },
    },
    {
      "@type": "Question",
      name: "Is BES a CRM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "BES is not merely a CRM. It provides specialized operational software for credit repair and funding fulfillment. BES can connect to your existing CRM or provide a front-office CRM layer, but CreditOps and FundingOps do not require purchasing the CRM.",
      },
    },
    {
      "@type": "Question",
      name: "Does BES replace my marketing and automation tools?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. BES is strictly for the fulfillment and operations side of credit repair and funding. It stays CRM-agnostic and connects to your existing front-office CRM, SMS, email, and automation tools.",
      },
    },
    {
      "@type": "Question",
      name: "How does a credit client become a funding client?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When a credit client becomes funding-ready, you can add FundingOps and connect them into one Client 360 — without rebuilding the operation or creating a duplicate record. The same client keeps one identity, history, and documents across both workflows.",
      },
    },
  ],
};

const Index = () => {
  useSeo({
    title: "BES — Credit Repair & Funding Operations Software",
    description:
      "BES is one connected operating system for credit repair and business funding. Start with CreditOps or FundingOps. Add DIY credit, operational intelligence, or the full suite as you grow. Built for credit repair companies, funding brokers, and teams that offer both.",
    canonical: "/",
    keywords:
      "credit repair software, business funding software, credit repair business software, funding operations software, credit repair and funding software, dispute operations, white label credit repair, BES platform",
    jsonLd: [orgJsonLd, productJsonLd, breadcrumbJsonLd, faqJsonLd],
  });

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <Hero />
        <ProblemSection />
        <ProductSelector />
        <EcosystemSection />
        <JourneySection />
        <StandaloneConnected />
        <AiPositioning />
        <Pricing />
        <TrustSection />
        <FaqSection />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;

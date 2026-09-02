import { ProductPage } from "@/components/marketing/ProductPage";
import { getProduct } from "@/lib/bes-products";

const product = getProduct("crm")!;

export default function CrmPage() {
  return (
    <ProductPage
      product={product}
      title="BES CRM — Front-Office CRM & Automation Layer | BES"
      description="BES CRM provides or connects the front-office CRM layer for lead capture, funnels, forms, calendars, sales pipeline, SMS, email, and automation. The operational platform stays CRM-agnostic — CreditOps and FundingOps never require it."
      keywords="credit repair CRM, funding CRM, front office CRM, lead capture, sales pipeline, SMS email automation, CRM agnostic"
      h1="BES CRM"
      subhead="Need a front-office CRM too? BES can provide or connect the CRM layer for lead capture, funnels, forms, calendars, sales pipeline, SMS, email, and automation. The operational platform stays CRM-agnostic."
      visualVariant="crm"
      useCase={[
        {
          title: "Front-office sales",
          points: [
            "Lead capture",
            "Funnels & forms",
            "Calendars & appointments",
            "Sales pipeline",
          ],
        },
        {
          title: "Automation & messaging",
          points: [
            "SMS & email",
            "Automation",
            "Connect your existing CRM",
            "Keep BES as the operational layer",
          ],
        },
      ]}
      upsell={[
        {
          title: "Add the operational layer",
          desc: "CreditOps turns your leads into managed credit-repair clients.",
          to: "/creditops",
          cta: "Explore CreditOps",
        },
        {
          title: "Add funding operations",
          desc: "FundingOps turns your pipeline into funded deals.",
          to: "/fundingops",
          cta: "Explore FundingOps",
        },
      ]}
    />
  );
}

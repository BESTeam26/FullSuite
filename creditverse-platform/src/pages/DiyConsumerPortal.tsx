import { useSeo } from "@/lib/use-seo";
import { DiyManagementProvider } from "@/lib/diy/diy-management-context";
import { DiyConsumerShell } from "@/components/diy/DiyConsumerShell";
import { ConsumerHome } from "@/components/diy/consumer/ConsumerHome";
import { ConsumerImport } from "@/components/diy/consumer/ConsumerImport";
import { ConsumerCreditReview } from "@/components/diy/consumer/ConsumerCreditReview";
import { ConsumerTruthGate } from "@/components/diy/consumer/ConsumerTruthGate";
import { ConsumerActionPlan } from "@/components/diy/consumer/ConsumerActionPlan";
import { ConsumerDisputePrep } from "@/components/diy/consumer/ConsumerDisputePrep";
import { ConsumerProgress } from "@/components/diy/consumer/ConsumerProgress";
import {
  ConsumerIssues,
  ConsumerEvidence,
  ConsumerDocuments,
  ConsumerEducation,
  ConsumerHelp,
} from "@/components/diy/consumer/ConsumerMisc";

// The DiyConsumerShell manages its own view state internally and renders
// children. We pass a default landing view; the shell's nav drives navigation.
// To keep the shell self-contained, it renders the active view itself.
const DiyConsumerPortal = () => {
  useSeo({
    title: "DIY Credit — Consumer Portal",
    description: "Consumer DIY credit portal.",
    canonical: "/diy-consumer",
    noindex: true,
  });
  return (
    <DiyManagementProvider>
      <DiyConsumerShell>
        <ConsumerHome />
      </DiyConsumerShell>
    </DiyManagementProvider>
  );
};

export default DiyConsumerPortal;

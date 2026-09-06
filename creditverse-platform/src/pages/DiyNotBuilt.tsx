/**
 * DIY Credit — designed, not built.
 *
 * What used to be here was a walkthrough over a bundled credit report:
 * invented items, invented progress, invented consumer counts. The DIY
 * consumer system has no tables yet; it is written up in
 * `ARCHITECTURE_PROPOSAL_DIY_CREDIT.md` and waiting on a decision.
 */
import { NotBuiltYet } from "@/pages/NotBuiltYet";

export default function DiyNotBuilt() {
  return (
    <NotBuiltYet
      title="DIY Credit is not built yet"
      detail="The self-service credit system for consumers — sign-up under your brand, their own report import, their own disputes and progress — is designed and waiting to be built. Nothing is shown here in the meantime, because anything shown would be invented."
    />
  );
}

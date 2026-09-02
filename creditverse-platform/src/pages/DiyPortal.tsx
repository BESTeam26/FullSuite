import { useSeo } from "@/lib/use-seo";
import { useDiy } from "@/lib/diy/diy-context";
import { DiyShell } from "@/components/diy/DiyShell";
import { DashboardView } from "@/components/diy/views/DashboardView";
import { ImportView } from "@/components/diy/views/ImportView";
import { DisputesView } from "@/components/diy/views/DisputesView";
import { RoundsView } from "@/components/diy/views/RoundsView";
import { LettersView } from "@/components/diy/views/LettersView";
import { MailView } from "@/components/diy/views/MailView";
import { ProgressView } from "@/components/diy/views/ProgressView";
import { LearnView } from "@/components/diy/views/LearnView";
import { DocumentsView, SettingsView } from "@/components/diy/views/MiscViews";
import { DiyProvider } from "@/lib/diy/diy-context";

const DiyRouter = () => {
  const { view } = useDiy();
  switch (view) {
    case "dashboard":
      return <DashboardView />;
    case "import":
      return <ImportView />;
    case "disputes":
      return <DisputesView />;
    case "rounds":
      return <RoundsView />;
    case "letters":
      return <LettersView />;
    case "mail":
      return <MailView />;
    case "progress":
      return <ProgressView />;
    case "learn":
      return <LearnView />;
    case "documents":
      return <DocumentsView />;
    case "settings":
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
};

const DiyPortal = () => {
  useSeo({
    title: "DIY Credit Portal — BES",
    description: "DIY credit portal.",
    canonical: "/diy",
    noindex: true,
  });
  return (
    <DiyProvider>
      <DiyShell>
        <DiyRouter />
      </DiyShell>
    </DiyProvider>
  );
};

export default DiyPortal;

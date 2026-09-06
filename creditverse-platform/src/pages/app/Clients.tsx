/**
 * All Clients — the organization's master client directory.
 *
 * A list, not a pipeline. The operational question "who are we doing credit
 * repair work for right now" is CreditOps → Credit Cases, which is a different
 * screen because it is a different question.
 */
import { ClientDirectoryPage } from "@/components/clients/directory/ClientDirectoryPage";

const Clients = () => <ClientDirectoryPage />;

export default Clients;

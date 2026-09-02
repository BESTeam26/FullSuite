import { DiyManagementProvider } from "@/lib/diy/diy-management-context";
import { DiyManagementShell } from "@/components/diy/DiyManagementShell";

const DiyManagement = () => (
  <DiyManagementProvider>
    <DiyManagementShell />
  </DiyManagementProvider>
);

export default DiyManagement;

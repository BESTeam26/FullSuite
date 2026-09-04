import { Briefcase, FolderKanban, Target, Megaphone, FileText, Layers, Users, Home, type LucideProps } from "lucide-react";

/** Fixed sets: the database stores the name; only these render. */
export const WORKSPACE_ICONS = ["briefcase", "folder", "target", "megaphone", "file-text", "layers", "users", "home"] as const;
export const WORKSPACE_COLOURS = ["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#dc2626", "#16a34a", "#475569"] as const;
export const STATUS_COLOURS = ["#64748b", "#2563eb", "#7c3aed", "#d97706", "#dc2626", "#16a34a", "#0f766e"] as const;

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  briefcase: Briefcase, folder: FolderKanban, target: Target, megaphone: Megaphone,
  "file-text": FileText, layers: Layers, users: Users, home: Home,
};

export const WorkspaceIcon = ({ name, className }: { name: string | null | undefined; className?: string }) => {
  const Icon = (name && ICONS[name]) || FolderKanban;
  return <Icon className={className} />;
};

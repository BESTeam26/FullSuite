/**
 * One icon per Organization Hub module. Kept beside the module registry so a
 * new module needs a row, a screen and an icon — and nothing else.
 */
import {
  BarChart3, BookOpen, Building2, CalendarDays, ClipboardList, FileText, FolderOpen,
  GraduationCap, LayoutGrid, ListTodo, Megaphone, MessagesSquare, Sparkles, Target,
  Timer, TrendingUp, Users, Wrench,
} from "lucide-react";

export const HUB_MODULE_ICONS: Record<string, React.ElementType> = {
  home: LayoutGrid,
  announcements: Megaphone,
  people: Users,
  departments: Building2,
  my_work: ListTodo,
  knowledge: BookOpen,
  files: FolderOpen,
  tools: Wrench,
  calendar: CalendarDays,
  requests: ClipboardList,
  forms: FileText,
  dept_spaces: LayoutGrid,
  ops_dashboard: BarChart3,
  kpis: BarChart3,
  goals: Target,
  productivity: TrendingUp,
  eod: Timer,
  training: GraduationCap,
  coaching: MessagesSquare,
  assistant: Sparkles,
  sop_search: Sparkles,
};

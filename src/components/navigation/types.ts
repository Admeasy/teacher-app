import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface NavItem {
  label: string;
  to?: string;                 // leaf link
  icon?: LucideIcon;
  badge?: string | number;
  comingSoon?: boolean;
  hidden?: boolean;
  children?: NavItem[];        // makes it a group
  exact?: boolean;
}

export interface NavSection {
  id: string;                  // stable id for persisted open-state
  label?: string;              // optional uppercase section header
  items: NavItem[];
}

export interface NavConfig {
  roleId: "admin" | "teacher";
  roleLabel: string;
  sections: NavSection[];
  mobileBottom?: NavItem[];    // 4-5 priority items for the bottom bar
}

export type SidebarContextMeta = {
  basePath?: string;           // optional prefix to detect active when nested
};

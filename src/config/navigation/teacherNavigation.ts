import {
  LayoutDashboard, Users, Zap,
  ClipboardCheck, GraduationCap, BookOpen, FileText, Notebook,
  Sparkles, Wand2, HelpCircle, Brain, MessagesSquare,
  BarChart3, LineChart, AlertTriangle, TrendingUp,
  Megaphone, Mail, Bell,
  User as UserIcon, Settings as SettingsIcon, SlidersHorizontal, Upload, Banknote, Bus,
} from "lucide-react";
import type { NavConfig } from "@/components/navigation/types";

export function createTeacherNavigation(basePath = "/teacher"): NavConfig {
  return {
  roleId: "teacher",
  roleLabel: "Teacher",
  sections: [
    {
      id: "core",
      items: [
        {
          label: "Dashboard", icon: LayoutDashboard,
          children: [
            { label: "Overview",      to: `${basePath}/dashboard`,        icon: LayoutDashboard, exact: true },
            { label: "My Classes",    to: `${basePath}/dashboard/classes`,icon: Users,           comingSoon: true },
            { label: "Quick Actions", to: `${basePath}/dashboard/actions`,icon: Zap,             comingSoon: true },
          ],
        },
      ],
    },
    {
      id: "classroom",
      label: "Classroom",
      items: [
        {
          label: "Classroom", icon: GraduationCap,
          children: [
            { label: "Attendance",    to: `${basePath}/attendance`,            icon: ClipboardCheck },
            { label: "Leaves",        to: `${basePath}/leave`,                 icon: ClipboardCheck },
            { label: "Students",      to: `${basePath}/classroom/students`,    icon: Users,    comingSoon: true },
            { label: "Assignments",   to: `${basePath}/classroom/assignments`, icon: BookOpen, comingSoon: true },
            { label: "Tests",         to: `${basePath}/classroom/tests`,       icon: FileText, comingSoon: true },
            { label: "Lesson Plans",  to: `${basePath}/classroom/lessons`,     icon: Notebook, comingSoon: true },
          ],
        },
        {
          label: "AI Workspace", icon: Sparkles,
          children: [
            { label: "AI Chat",             to: `${basePath}/ai`,                       icon: MessagesSquare, exact: true },
            { label: "Lesson Planner",      to: `${basePath}/ai/lesson-planner`,        icon: Wand2,    comingSoon: true },
            { label: "Question Generator",  to: `${basePath}/ai/questions`,             icon: HelpCircle, comingSoon: true },
            { label: "Performance Insights",to: `${basePath}/ai/insights`,              icon: Brain,    comingSoon: true },
          ],
        },
      ],
    },
    {
      id: "analytics",
      label: "Analytics",
      items: [
        {
          label: "Analytics", icon: BarChart3,
          children: [
            { label: "Class Analytics",     to: `${basePath}/analytics/classes`,     icon: BarChart3,    comingSoon: true },
            { label: "Attendance Trends",  to: `${basePath}/analytics/attendance`,  icon: LineChart,    comingSoon: true },
            { label: "Weak Students",      to: `${basePath}/analytics/weak`,        icon: AlertTriangle,comingSoon: true },
            { label: "Performance Reports",to: `${basePath}/analytics/reports`,     icon: TrendingUp,   comingSoon: true },
          ],
        },
        {
          label: "Communication", icon: Megaphone,
          children: [
            { label: "Announcements",  to: `${basePath}/comms/announcements`, icon: Megaphone, comingSoon: true },
            { label: "Parent Messages",to: `${basePath}/comms/parents`,       icon: Mail,      comingSoon: true },
            { label: "Class Notices",  to: `${basePath}/comms/notices`,       icon: Bell,      comingSoon: true },
          ],
        },
      ],
    },
    {
      id: "account",
      label: "Account",
      items: [
        {
          label: "Profile", icon: UserIcon,
          children: [
            { label: "My Profile",  to: `${basePath}/profile`,  icon: UserIcon },
            { label: "My Salary",   to: `${basePath}/salary`,   icon: Banknote },
            { label: "Transport",   to: `${basePath}/transport`,icon: Bus },
            { label: "Settings",    to: `${basePath}/settings`, icon: SettingsIcon },
            { label: "Preferences", to: `${basePath}/preferences`, icon: SlidersHorizontal, comingSoon: true },
          ],
        },
        { label: "Import", to: `${basePath}/import`, icon: Upload },
      ],
    },
  ],
  mobileBottom: [
    { label: "Home",       to: `${basePath}/dashboard`,  icon: LayoutDashboard, exact: true },
    { label: "Attendance", to: `${basePath}/attendance`, icon: ClipboardCheck },
    { label: "AI",         to: `${basePath}/ai`,         icon: Sparkles },
    { label: "Profile",    to: `${basePath}/profile`,    icon: UserIcon },
  ],
  };
}

export const teacherNavigation = createTeacherNavigation();

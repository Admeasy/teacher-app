import {
  LayoutDashboard, TrendingUp, Activity,
  Sparkles, BookOpen, FileText, HelpCircle, Calendar as CalendarIcon,
  ClipboardCheck, LineChart, BarChart3,
  Award, FileBarChart, Layers,
  Megaphone, Bell, School,
  User as UserIcon, Settings as SettingsIcon, SlidersHorizontal,
  CalendarOff, Bus, Wallet,
} from "lucide-react";
import type { NavConfig } from "@/components/navigation/types";

export function createStudentNavigation(basePath = "/student"): NavConfig {
  return {
  roleId: "student",
  roleLabel: "Student",
  sections: [
    {
      id: "core",
      items: [
        {
          label: "Dashboard", icon: LayoutDashboard,
          children: [
            { label: "Overview",    to: `${basePath}/dashboard`,         icon: LayoutDashboard, exact: true },
            { label: "Progress",    to: `${basePath}/dashboard/progress`,icon: TrendingUp, comingSoon: true },
            { label: "Quick Stats", to: `${basePath}/dashboard/stats`,   icon: Activity,   comingSoon: true },
          ],
        },
      ],
    },
    {
      id: "study",
      label: "Study",
      items: [
        {
          label: "Learning", icon: Sparkles,
          children: [
            { label: "AI Study Assistant", to: `${basePath}/ai`,                    icon: Sparkles, exact: true },
            { label: "Study Plans",        to: `${basePath}/learning/plans`,        icon: CalendarIcon, comingSoon: true },
            { label: "Assignments",        to: `${basePath}/learning/assignments`,  icon: BookOpen,     comingSoon: true },
            { label: "Tests",              to: `${basePath}/learning/tests`,        icon: FileText,     comingSoon: true },
            { label: "PYQs",               to: `${basePath}/learning/pyqs`,         icon: HelpCircle,   comingSoon: true },
          ],
        },
        {
          label: "Attendance", icon: ClipboardCheck,
          children: [
            { label: "My Attendance",       to: `${basePath}/attendance`,            icon: ClipboardCheck, exact: true },
            { label: "Attendance Insights", to: `${basePath}/attendance/insights`,   icon: LineChart, comingSoon: true },
            { label: "Monthly Trends",      to: `${basePath}/attendance/monthly`,    icon: BarChart3, comingSoon: true },
          ],
        },
        {
          label: "Leaves", icon: CalendarOff,
          children: [
            { label: "My Leaves", to: `${basePath}/leave`, icon: CalendarOff, exact: true },
          ],
        },
        {
          label: "Transport", icon: Bus,
          children: [
            { label: "My Transport", to: `${basePath}/transport`, icon: Bus, exact: true },
          ],
        },
        {
          label: "Fees", icon: Wallet,
          children: [
            { label: "My Fees", to: `${basePath}/fees`, icon: Wallet, exact: true },
          ],
        },
      ],
    },
    {
      id: "performance",
      label: "Performance",
      items: [
        {
          label: "Performance", icon: Award,
          children: [
            { label: "Marks",            to: `${basePath}/performance/marks`,    icon: Award,        comingSoon: true },
            { label: "Reports",          to: `${basePath}/performance/reports`,  icon: FileBarChart, comingSoon: true },
            { label: "Subject Progress", to: `${basePath}/performance/subjects`, icon: Layers,       comingSoon: true },
            { label: "Analytics",        to: `${basePath}/performance/analytics`,icon: BarChart3,    comingSoon: true },
          ],
        },
        {
          label: "Communication", icon: Megaphone,
          children: [
            { label: "Announcements",  to: `${basePath}/comms/announcements`, icon: Megaphone, comingSoon: true },
            { label: "Teacher Notices",to: `${basePath}/comms/teachers`,      icon: Bell,      comingSoon: true },
            { label: "School Updates", to: `${basePath}/comms/school`,        icon: School,    comingSoon: true },
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
            { label: "My Profile",  to: `${basePath}/profile`,     icon: UserIcon },
            { label: "Settings",    to: `${basePath}/settings`,    icon: SettingsIcon },
            { label: "Preferences", to: `${basePath}/preferences`, icon: SlidersHorizontal, comingSoon: true },
          ],
        },
      ],
    },
  ],
  mobileBottom: [
    { label: "Home",       to: `${basePath}/dashboard`,  icon: LayoutDashboard, exact: true },
    { label: "Learning",   to: `${basePath}/ai`,         icon: Sparkles },
    { label: "Attendance", to: `${basePath}/attendance`, icon: ClipboardCheck },
    { label: "Profile",    to: `${basePath}/profile`,    icon: UserIcon },
  ],
  };
}

export const studentNavigation = createStudentNavigation();

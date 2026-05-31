import {
  LayoutDashboard, BarChart3, FileText, Bell,
  Users, GraduationCap, School, Layers, CalendarDays, CalendarOff, Building2,
  ClipboardCheck, ListChecks, AlertTriangle, UserCheck, LineChart,
  Wallet, Receipt, BadgeDollarSign, FileSpreadsheet, PiggyBank, Banknote,
  Sparkles, Brain, Activity, TrendingUp, MessagesSquare,
  Megaphone, Mail, Send, Bell as BellIcon,
  Upload, History, ShieldCheck, Database,
  Settings as SettingsIcon, Palette, KeyRound, Plug, BookOpen,
  Bus, Briefcase,
} from "lucide-react";
import type { NavConfig } from "@/components/navigation/types";

export const adminNavigation: NavConfig = {
  roleId: "admin",
  roleLabel: "School Admin",
  sections: [
    {
      id: "core",
      items: [
        {
          label: "Dashboard", icon: LayoutDashboard,
          children: [
            { label: "Overview",      to: "/dashboard",          icon: LayoutDashboard },
            { label: "Analytics",     to: "/admin-portal/analytics",  icon: BarChart3, comingSoon: true },
            { label: "Reports",       to: "/admin-portal/reports",    icon: FileText,  comingSoon: true },
            { label: "Notifications", to: "/notifications",      icon: Bell },
          ],
        },
        {
          label: "AI Terminal", icon: Sparkles,
          children: [
            { label: "AI Assistant",         to: "/ai/chat",                          icon: MessagesSquare },
            { label: "Student Analytics AI", to: "/admin-portal/ai/students",         icon: Brain,      comingSoon: true },
            { label: "Teacher Analytics AI", to: "/admin-portal/ai/teachers",         icon: Brain,      comingSoon: true },
            { label: "Attendance Insights", to: "/admin-portal/ai/attendance",        icon: Activity,   comingSoon: true },
            { label: "Performance Predictions", to: "/admin-portal/ai/predictions",   icon: TrendingUp, comingSoon: true },
          ],
        },
      ],
    },
    {
      id: "school",
      label: "Operations",
      items: [
        {
          label: "School Management", icon: School,
          children: [
            { label: "Students",          to: "/students",                          icon: Users },
            { label: "Teachers",          to: "/teachers",                          icon: GraduationCap },
            { label: "Staff (Non-teaching)", to: "/staff",                         icon: Briefcase },
            { label: "Classes",           to: "/admin-portal/school/classes",       icon: Layers,        comingSoon: true },
            { label: "Sections",          to: "/admin-portal/school/sections",      icon: Layers,        comingSoon: true },
            { label: "Academic Calendar", to: "/calendar",                          icon: CalendarDays },
            { label: "Holidays",          to: "/admin-portal/school/holidays",      icon: CalendarOff,   comingSoon: true },
            { label: "Departments",       to: "/admin-portal/school/departments",   icon: Building2,     comingSoon: true },
          ],
        },
        {
          label: "Attendance", icon: ClipboardCheck,
          children: [
            { label: "Live Attendance",       to: "/admin-portal/attendance/live",      icon: ClipboardCheck, comingSoon: true },
            { label: "Attendance Reports",    to: "/admin-portal/attendance/reports",   icon: ListChecks,     comingSoon: true },
            { label: "Low Attendance Alerts", to: "/admin-portal/attendance/alerts",    icon: AlertTriangle,  comingSoon: true },
            { label: "Teacher Attendance",    to: "/admin-portal/attendance/teachers",  icon: UserCheck,      comingSoon: true },
            { label: "Monthly Analytics",     to: "/admin-portal/attendance/monthly",   icon: LineChart,      comingSoon: true },
            { label: "Leave Management",      to: "/admin-portal/leave",                icon: CalendarOff },
          ],
        },
        {
          label: "Fees & Finance", icon: Wallet,
          children: [
            { label: "Teacher Payroll",  to: "/dashboard/payroll",                 icon: Banknote },
            { label: "Fee Structure",    to: "/dashboard/fees/structure",          icon: FileSpreadsheet },
            { label: "Fee Payments",     to: "/dashboard/fees/payments",           icon: Receipt },
            { label: "Fee Reports",      to: "/dashboard/fees/reports",            icon: PiggyBank },
            { label: "Scholarships",     to: "/admin-portal/finance/scholarships", icon: BadgeDollarSign, comingSoon: true },
            { label: "Invoices",         to: "/admin-portal/finance/invoices",     icon: FileSpreadsheet, comingSoon: true },
          ],
        },
        {
          label: "Transport", icon: Bus,
          children: [
            { label: "Transport Console", to: "/dashboard/transport", icon: Bus },
          ],
        },
      ],
    },
    {
      id: "engage",
      label: "Engage",
      items: [
        {
          label: "Communication", icon: Megaphone,
          children: [
            { label: "Announcements",        to: "/admin-portal/comms/announcements", icon: Megaphone, comingSoon: true },
            { label: "Parent Notifications", to: "/admin-portal/comms/parents",       icon: Mail,      comingSoon: true },
            { label: "Teacher Broadcasts",   to: "/admin-portal/comms/teachers",      icon: Send,      comingSoon: true },
            { label: "Student Notices",      to: "/admin-portal/comms/students",      icon: BellIcon,  comingSoon: true },
          ],
        },
        {
          label: "Imports & Data", icon: Database,
          children: [
            { label: "Student Imports", to: "/admin-portal/imports/students", icon: Upload,     comingSoon: true },
            { label: "Teacher Imports", to: "/admin-portal/imports/teachers", icon: Upload,     comingSoon: true },
            { label: "Import History",  to: "/admin-portal/imports/history",  icon: History,    comingSoon: true },
            { label: "Data Validation", to: "/data",                          icon: ShieldCheck },
            { label: "Knowledge Base",  to: "/knowledge",                     icon: BookOpen },
          ],
        },
      ],
    },
    {
      id: "system",
      label: "System",
      items: [
        {
          label: "Settings", icon: SettingsIcon,
          children: [
            { label: "School Settings",   to: "/settings",                          icon: SettingsIcon },
            { label: "Branding",          to: "/admin-portal/settings/branding",    icon: Palette,    comingSoon: true },
            { label: "Permissions",       to: "/admin-portal/settings/permissions", icon: KeyRound,   comingSoon: true },
            { label: "Attendance Rules",  to: "/admin-portal/settings/attendance",  icon: ClipboardCheck, comingSoon: true },
            { label: "Academic Years",    to: "/admin-portal/settings/years",       icon: CalendarDays, comingSoon: true },
            { label: "Integrations",      to: "/integrations",                      icon: Plug },
          ],
        },
      ],
    },
  ],
  mobileBottom: [
    { label: "Home",   to: "/dashboard",     icon: LayoutDashboard, exact: true },
    { label: "School", to: "/students",      icon: Users },
    { label: "AI",     to: "/ai/chat",       icon: Sparkles },
    { label: "Alerts", to: "/notifications", icon: Bell },
    { label: "More",   to: "/settings",      icon: SettingsIcon },
  ],
};

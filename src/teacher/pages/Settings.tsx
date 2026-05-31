"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Bell, KeyRound, Mail, Moon } from "lucide-react";
import { useTeacherSession } from "../hooks/useTeacherSession";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function Settings() {
  const { logout } = useTeacherSession();
  const router = useRouter();
  function handleLogout() {
    logout();
    toast.success("Logged out");
    router.replace("/login");
  }
  function soon() { toast.info("Coming soon"); }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto flex flex-col gap-4">
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-semibold tracking-tight">
        Settings
      </motion.h1>

      <Group title="Security">
        <Item icon={KeyRound} title="Set a password" desc="Use a password instead of OTP next time." onClick={soon} />
        <Item icon={Mail} title="Change login email" desc="Update the email that receives your OTPs." onClick={soon} />
      </Group>

      <Group title="Preferences">
        <Item icon={Bell} title="Notifications" desc="Manage email and push alerts." onClick={soon} />
        <div className="flex items-center justify-between p-4 hover:bg-surface-2/30 rounded-lg">
          <div className="flex items-center gap-3">
            <Moon size={18} className="text-violet-glow" />
            <div>
              <div className="text-sm font-medium">Theme</div>
              <div className="text-xs text-muted-foreground">Switch between dark and light mode.</div>
            </div>
          </div>
          <ThemeToggle compact />
        </div>
      </Group>

      <Group title="Session">
        <Item icon={LogOut} title="Log out" desc="Sign out of this device." onClick={handleLogout} tone="danger" />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-2">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground px-3 pt-2 pb-1">{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
function Item({ icon: Icon, title, desc, onClick, tone }: { icon: any; title: string; desc: string; onClick: () => void; tone?: "danger" }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 text-left p-4 hover:bg-surface-2/30 rounded-lg transition-colors ${tone === "danger" ? "text-danger" : ""}`}>
      <Icon size={18} className={tone === "danger" ? "text-danger" : "text-violet-glow"} />
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}

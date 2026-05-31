import { supabase } from "@/integrations/supabase/client";

async function call(action: string, payload: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-schools", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const adminApi = {
  list:    (filters: any = {}, page = 1, limit = 25) => call("list", { filters, page, limit }),
  stats:   () => call("stats"),
  get:     (id: string) => call("get", { id }),
  create:  (payload: any) => call("create", { payload }),
  update:  (id: string, payload: any) => call("update", { id, payload }),
  suspend: (id: string, suspended: boolean) => call("suspend", { id, suspended }),
  remove:  (id: string) => call("delete", { id }),
};

export async function bootstrapSuperAdmin() {
  try {
    await supabase.functions.invoke("bootstrap-super-admin", { body: {} });
  } catch { /* ignore */ }
}

export async function checkIsSuperAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) return false;
  return data === true;
}

export function generatePassword(len = 14): string {
  const sets = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghjkmnpqrstuvwxyz",
    "23456789",
    "!@#$%^&*",
  ];
  const all = sets.join("");
  let out = sets.map((s) => s[Math.floor(Math.random() * s.length)]).join("");
  for (let i = out.length; i < len; i++) out += all[Math.floor(Math.random() * all.length)];
  return out.split("").sort(() => Math.random() - 0.5).join("");
}

export function passwordStrength(p: string): { score: 0|1|2|3|4; label: string } {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  const labels = ["Too short", "Weak", "Fair", "Strong", "Excellent"];
  return { score: Math.min(4, s) as any, label: labels[Math.min(4, s)] };
}

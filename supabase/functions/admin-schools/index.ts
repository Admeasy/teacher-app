// Admin Schools CRUD — super-admin only.
// Routes (method + body.action):
//   POST { action: "list",   filters?, page?, limit? }
//   POST { action: "stats" }
//   POST { action: "get",    id }
//   POST { action: "create", payload }
//   POST { action: "update", id, payload }
//   POST { action: "delete", id }
//   POST { action: "suspend", id, suspended: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// --- helpers -------------------------------------------------------
function sanitize(payload: any) {
  // Whitelist top-level fields; drop unknown keys & nested arbitrary keys.
  const allow = ["school_id", "account_status", "school_info", "location", "principal", "statistics", "media"];
  const out: Record<string, any> = {};
  for (const k of allow) if (payload?.[k] !== undefined) out[k] = payload[k];
  if (out.account_status && !["active", "suspended"].includes(out.account_status)) {
    delete out.account_status;
  }
  return out;
}

function validateCreate(p: any): string | null {
  if (!p?.school_id || typeof p.school_id !== "string" || p.school_id.trim().length < 3) {
    return "school_id is required (min 3 chars)";
  }
  if (!p?.password || typeof p.password !== "string" || p.password.length < 8) {
    return "password is required (min 8 chars)";
  }
  if (!p?.school_info?.name || typeof p.school_info.name !== "string") {
    return "school_info.name is required";
  }
  return null;
}

// --- handler -------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. Verify caller JWT
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Enforce super_admin role (JWT-based middleware)
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleErr) return json({ error: "Role check failed" }, 500);
  if (!roleRow) return json({ error: "Forbidden — super_admin required" }, 403);



  // 3. Dispatch
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body?.action;

  try {
    switch (action) {
      // ---------------- LIST ----------------
      case "list": {
        const page  = Math.max(1, Number(body.page  ?? 1));
        const limit = Math.min(100, Math.max(1, Number(body.limit ?? 25)));
        const from  = (page - 1) * limit;
        const to    = from + limit - 1;
        const f     = body.filters ?? {};

        let q = admin.from("schools").select("*", { count: "exact" }).order("created_at", { ascending: false });
        if (f.status && f.status !== "all") q = q.eq("account_status", f.status);
        if (f.search) {
          const s = String(f.search).trim();
          if (s) q = q.or(`school_id.ilike.%${s}%,school_info->>name.ilike.%${s}%`);
        }
        if (f.type)   q = q.eq("school_info->>type", f.type);
        if (f.size)   q = q.eq("school_info->>size", f.size);
        if (f.state)  q = q.eq("location->>state", f.state);
        if (f.city)   q = q.eq("location->>city", f.city);
        q = q.range(from, to);

        const { data, count, error } = await q;
        if (error) throw error;
        return json({ data, count, page, limit });
      }

      // ---------------- STATS ----------------
      case "stats": {
        const [{ count: total }, { count: active }, { count: recent }] = await Promise.all([
          admin.from("schools").select("id", { count: "exact", head: true }),
          admin.from("schools").select("id", { count: "exact", head: true }).eq("account_status", "active"),
          admin.from("schools").select("id", { count: "exact", head: true })
            .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
        ]);
        return json({ total: total ?? 0, active: active ?? 0, recent: recent ?? 0 });
      }

      // ---------------- GET ----------------
      case "get": {
        if (!body.id) return json({ error: "id required" }, 400);
        const { data, error } = await admin.from("schools").select("*").eq("id", body.id).maybeSingle();
        if (error) throw error;
        return json({ data });
      }

      // ---------------- CREATE ----------------
      case "create": {
        const p = body.payload ?? {};
        const err = validateCreate(p);
        if (err) return json({ error: err }, 400);

        const schoolId = String(p.school_id).trim();
        const email    = `${schoolId.toLowerCase()}@admeasy.in`;

        // Uniqueness check
        const { data: dupe } = await admin.from("schools").select("id").eq("school_id", schoolId).maybeSingle();
        if (dupe) return json({ error: "School ID already exists" }, 409);

        // 1. Create auth user (Supabase handles bcrypt + JWT)
        const { data: created, error: authErr } = await admin.auth.admin.createUser({
          email,
          password: p.password,
          email_confirm: true,
          user_metadata: { school_id: schoolId, school_name: p.school_info?.name ?? null },
        });
        if (authErr) return json({ error: `Auth user: ${authErr.message}` }, 400);

        // 2. Insert school row
        const insert = { ...sanitize(p), school_id: schoolId, created_by: userId };
        delete (insert as any).password;
        const { data: row, error: insErr } = await admin.from("schools").insert(insert).select().single();
        if (insErr) {
          // Roll back the auth user so the operation is atomic from the caller's POV
          await admin.auth.admin.deleteUser(created.user!.id).catch(() => {});
          return json({ error: insErr.message }, 400);
        }

        // 3. Fire-and-forget welcome email (never blocks success)
        try {
          const principalName = p.principal?.name ?? p.school_info?.name ?? "School Admin";
          const recipient     = p.principal?.email || p.school_info?.email;
          if (recipient) {
            await admin.functions.invoke("send-transactional-email", {
              body: {
                templateName: "school-welcome",
                recipientEmail: recipient,
                idempotencyKey: `school-welcome-${row.id}`,
                templateData: {
                  name: principalName,
                  schoolName: p.school_info?.name,
                  schoolId,
                  password: p.password,
                  loginUrl: `${new URL(req.url).origin.replace(/\/functions.*$/, "")}/login`,
                },
              },
            });
          }
        } catch (_) { /* swallow — email infra optional */ }

        return json({ data: row });
      }

      // ---------------- UPDATE ----------------
      case "update": {
        if (!body.id) return json({ error: "id required" }, 400);
        const patch = sanitize(body.payload ?? {});
        delete (patch as any).school_id; // immutable
        const { data, error } = await admin.from("schools").update(patch).eq("id", body.id).select().single();
        if (error) throw error;
        return json({ data });
      }

      // ---------------- SUSPEND ----------------
      case "suspend": {
        if (!body.id) return json({ error: "id required" }, 400);
        const status = body.suspended ? "suspended" : "active";
        const { data, error } = await admin.from("schools")
          .update({ account_status: status }).eq("id", body.id).select().single();
        if (error) throw error;
        return json({ data });
      }

      // ---------------- DELETE ----------------
      case "delete": {
        if (!body.id) return json({ error: "id required" }, 400);
        const { data: row } = await admin.from("schools").select("school_id").eq("id", body.id).maybeSingle();
        const { error } = await admin.from("schools").delete().eq("id", body.id);
        if (error) throw error;
        if (row?.school_id) {
          const email = `${row.school_id.toLowerCase()}@admeasy.in`;
          const { data: users } = await admin.auth.admin.listUsers();
          const u = users?.users?.find((x) => x.email?.toLowerCase() === email);
          if (u) await admin.auth.admin.deleteUser(u.id).catch(() => {});
        }
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});

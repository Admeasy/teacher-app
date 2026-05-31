// Edge function helpers — same production project as the main Supabase client.
export const EXT_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  "https://bhjtsmveghanbojpbswk.supabase.co";

export const EXT_SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoanRzbXZlZ2hhbmJvanBic3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDQyMjYsImV4cCI6MjA5MDUyMDIyNn0.IA5w277X-CG9eFU4Dm8xEe80m5wNZd2QUZXXPjd9x2o";

export interface ExtInvokeResult<T = any> {
  data: T | null;
  error: { message: string; status?: number } | null;
}

/**
 * Mirrors `supabase.functions.invoke(name, { body })` shape.
 * Uses the production project URL + anon key from env.
 */
export async function invokeExternal<T = any>(
  fn: string,
  opts: { body?: any; headers?: Record<string, string> } = {},
): Promise<ExtInvokeResult<T>> {
  const url = `${EXT_SUPABASE_URL}/functions/v1/${fn}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EXT_SUPABASE_ANON,
        Authorization: `Bearer ${EXT_SUPABASE_ANON}`,
        ...(opts.headers ?? {}),
      },
      body: JSON.stringify(opts.body ?? {}),
    });
    const ct = res.headers.get("content-type") ?? "";
    const payload: any = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);
    if (!res.ok) {
      const message =
        (payload && typeof payload === "object" && (payload.error?.message ?? payload.error ?? payload.message)) ||
        (typeof payload === "string" && payload) ||
        `Edge function ${fn} returned ${res.status}`;
      return { data: null, error: { message: String(message), status: res.status } };
    }
    return { data: payload as T, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e?.message ?? "Network error" } };
  }
}

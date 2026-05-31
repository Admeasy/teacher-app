import { supabase } from "@/integrations/supabase/client";
import { getAIContextSnapshot, useAIContext } from "@/stores/aiContextStore";

export interface ToolCallEvent {
  id: string;
  tool: string;
  input: any;
  status: "running" | "ok" | "error" | "awaiting_approval";
  output?: any;
  error?: string;
  affected?: Array<{ kind: string; id: string; label: string }>;
  undo?: { tool: string; input: any };
}

export interface RuntimeEvent {
  kind: "text" | "tool" | "done" | "error" | "navigate";
  text?: string;
  tool?: ToolCallEvent;
  error?: string;
  workflowId?: string;
  route?: string;
}

export interface RunAgentOptions {
  workspaceId: string;
  prompt: string;
  conversationId?: string;
  onEvent: (e: RuntimeEvent) => void;
  signal?: AbortSignal;
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/agent-runtime`;

/**
 * Single entrypoint for all AI calls from the admin shell.
 * Streams text + tool events from the agent-runtime edge function.
 */
export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const { workspaceId, prompt, conversationId, onEvent, signal } = opts;

  const ctx = getAIContextSnapshot();
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token ?? SUPABASE_PUBLISHABLE_KEY;

  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        prompt,
        conversation_id: conversationId,
        context: ctx,
      }),
      signal,
    });
  } catch (e: any) {
    onEvent({ kind: "error", error: e?.message ?? "Network error" });
    return;
  }

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    onEvent({ kind: "error", error: txt || `Runtime returned ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed) as RuntimeEvent;
        // Mirror tool events into context store for "recent actions"
        if (evt.kind === "tool" && evt.tool && evt.tool.status !== "running") {
          useAIContext.getState().pushAction({
            t: Date.now(),
            tool: evt.tool.tool,
            summary: evt.tool.output?.summary ?? evt.tool.error ?? evt.tool.tool,
            status: evt.tool.status === "ok" ? "ok" : evt.tool.status === "error" ? "error" : "awaiting_approval",
          });
        }
        onEvent(evt);
      } catch {
        // ignore malformed lines
      }
    }
  }
  onEvent({ kind: "done" });
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type AiRole = "user" | "assistant";

export interface ConversationMessage {
  id: string;
  workspace_id: string;
  conversation_id: string;
  role: AiRole;
  content: string;
  metadata: any;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function fallbackTitle(text: string) {
  const title = text.trim().replace(/\s+/g, " ").slice(0, 56);
  return title || "New conversation";
}

export function useConversation(workspaceId: string | null, initialConversationId: string | null) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  useEffect(() => {
    setConversationId(initialConversationId);
  }, [initialConversationId]);

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      if (!workspaceId || !conversationId) {
        setMessages([]);
        return;
      }

      const { data } = await supabase
        .from("ai_messages")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!cancelled) setMessages((data ?? []) as ConversationMessage[]);
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [conversationId, workspaceId]);

  const ensureConversation = useCallback(
    async (seed?: string) => {
      if (!workspaceId) return null;
      if (conversationId) return conversationId;

      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({ workspace_id: workspaceId, title: fallbackTitle(seed ?? "") })
        .select("id")
        .single();

      if (error) throw error;
      setConversationId(data.id);
      return data.id as string;
    },
    [conversationId, workspaceId],
  );

  const append = useCallback(
    async (role: AiRole, content: string, metadata: any = null) => {
      if (!workspaceId) return null;
      const id = await ensureConversation(content);
      if (!id) return null;

      const now = new Date().toISOString();
      const optimistic: ConversationMessage = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        conversation_id: id,
        role,
        content,
        metadata,
        created_at: now,
      };
      setMessages((current) => [...current, optimistic]);

      const { data, error } = await supabase
        .from("ai_messages")
        .insert({ workspace_id: workspaceId, conversation_id: id, role, content, metadata })
        .select("*")
        .single();

      if (!error && data) {
        setMessages((current) => current.map((message) => (message.id === optimistic.id ? (data as ConversationMessage) : message)));
        await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
      }

      return data as ConversationMessage | null;
    },
    [ensureConversation, workspaceId],
  );

  const newConversation = useCallback(async () => {
    if (!workspaceId) return null;
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ workspace_id: workspaceId, title: "New conversation" })
      .select("id")
      .single();

    if (error) throw error;
    setConversationId(data.id);
    setMessages([]);
    return data.id as string;
  }, [workspaceId]);

  const clearMessages = useCallback(async () => {
    if (!workspaceId || !conversationId) return;
    setMessages([]);
    await supabase
      .from("ai_messages")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId);
  }, [conversationId, workspaceId]);

  const recentForAI = useCallback(
    (limit: number) =>
      messages.slice(-limit).map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  );

  return {
    conversationId,
    messages,
    appendUser: (content: string, metadata?: any) => append("user", content, metadata),
    appendAssistant: (content: string, metadata?: any) => append("assistant", content, metadata),
    newConversation,
    clearMessages,
    recentForAI,
  };
}

export function useConversations(workspaceId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setConversations([]);
      return;
    }

    const { data } = await supabase
      .from("ai_conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(40);

    setConversations((data ?? []) as ConversationSummary[]);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = useCallback(
    async (id: string) => {
      setConversations((current) => current.filter((item) => item.id !== id));
      await supabase.from("ai_conversations").delete().eq("id", id);
    },
    [],
  );

  return useMemo(() => ({ conversations, reload: load, remove }), [conversations, load, remove]);
}

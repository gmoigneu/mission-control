import { Loader2, Plus, Send, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Markdown } from "./Markdown";
import { useMe } from "../lib/auth";
import { useAya } from "../features/agent/AyaContext";
import { usePersona } from "../features/persona/api";
import {
  type AgentWrite,
  type Conversation,
  type ConversationMessage,
  CONVERSATION_KEY,
  invalidateForWrites,
  useChat,
  useCurrentConversation,
  useNewConversation,
  useRevertRun,
} from "../features/agent/api";

const DEFAULT_GREETING = "Hi G — I'm Aya. Tell me what to do, and I'll act on your data.";

function conversationMessageKey(message: ConversationMessage): string {
  const writeIds = message.writes.map((write) => write.id).join(",");
  return `${message.role}:${message.run_id ?? "pending"}:${message.text}:${writeIds}`;
}

// ─── Writes card (Undo) ─────────────────────────────────────────────────────────

function WritesCard({
  writes,
  runId,
  reverted,
  onReverted,
}: {
  writes: AgentWrite[];
  runId: string;
  reverted: boolean;
  onReverted: () => void;
}) {
  const qc = useQueryClient();
  const revert = useRevertRun();

  async function handleUndo() {
    await revert.mutateAsync(runId);
    invalidateForWrites(qc, writes);
    onReverted();
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 6,
        padding: "8px 10px",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-sm)",
        fontSize: 12,
        color: "var(--fg-dim)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: reverted ? 0 : 8 }}>
        {writes.map((w) => (
          <span key={w.id} className="row gap-1" style={{ gap: 5 }}>
            <span className="spark" style={{ fontSize: 11 }}>✦</span>
            <span style={{ color: "var(--fg-muted)" }}>
              {w.action} {w.entity_type.replace("_", " ")}
            </span>
          </span>
        ))}
      </div>
      {!reverted ? (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => void handleUndo()}
          disabled={revert.isPending}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          {revert.isPending ? (
            <Loader2 size={11} strokeWidth={1.6} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Undo2 size={11} strokeWidth={1.6} />
          )}
          Undo
        </button>
      ) : (
        <span style={{ fontSize: 11, color: "var(--fg-faint)", fontStyle: "italic" }}>
          Reverted
        </span>
      )}
    </div>
  );
}

// ─── Quake window ────────────────────────────────────────────────────────────────

/**
 * Aya as a "quake" console: a panel that slides up from the bottom edge,
 * overlaying the page. Toggled with Ctrl+` (or the header/nav buttons), closed
 * with Esc. Mounted once at the route root so the open state, draft, scroll
 * position, and any in-flight request all survive route navigation.
 */
export function AyaQuake() {
  const me = useMe();
  // Only present for authenticated sessions (never on the login screen).
  if (!me.data) return null;
  return <AyaQuakeInner />;
}

function AyaQuakeInner() {
  const { open, toggle, closeAya } = useAya();
  const qc = useQueryClient();
  const conv = useCurrentConversation();
  const chat = useChat();
  const newConv = useNewConversation();
  const { data: persona } = usePersona();

  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [revertedIds, setRevertedIds] = useState<Set<string>>(new Set());
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ayaName = persona?.name?.trim() || "Aya";
  const greeting = persona?.greeting?.trim() || DEFAULT_GREETING;
  const serverMessages = useMemo(() => conv.data?.messages ?? [], [conv.data?.messages]);

  // Ctrl+` toggles the window from anywhere (VS Code-style; safe inside inputs
  // because it requires the Ctrl modifier).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.code === "Backquote" && !e.repeat) {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Esc closes while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAya();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAya]);

  // Focus the composer when the window opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [serverMessages, pending, chat.isPending, open]);

  function appendTurns(extra: ConversationMessage[], conversationId: string | null) {
    qc.setQueryData<Conversation>(CONVERSATION_KEY, (old) => {
      const base: Conversation = old ?? { id: conversationId ?? "", messages: [] };
      return {
        id: conversationId ?? base.id,
        messages: [...base.messages, ...extra],
      };
    });
  }

  async function handleNew() {
    setMsg("");
    setPending(null);
    await newConv.mutateAsync();
    inputRef.current?.focus();
  }

  async function handleSend() {
    const text = msg.trim();
    if (!text || chat.isPending) return;
    if (text === "/new") {
      await handleNew();
      return;
    }
    setMsg("");
    setPending(text);
    try {
      const res = await chat.mutateAsync({ message: text, conversation_id: conv.data?.id });
      appendTurns(
        [
          { role: "user", text, writes: [], run_id: null },
          {
            role: "assistant",
            text: res.reply,
            writes: res.writes,
            run_id: res.agent_run_id,
          },
        ],
        res.conversation_id ?? conv.data?.id ?? null,
      );
      invalidateForWrites(qc, res.writes);
    } catch {
      appendTurns(
        [
          { role: "user", text, writes: [], run_id: null },
          {
            role: "assistant",
            text: "Something went wrong. Please try again.",
            writes: [],
            run_id: null,
            error: true,
          },
        ],
        conv.data?.id ?? null,
      );
    } finally {
      setPending(null);
    }
  }

  const isEmpty = serverMessages.length === 0 && !pending && !chat.isPending;

  return (
    <>
      {open && (
        <button
          type="button"
          className="aya-quake-scrim"
          aria-label="Close Aya"
          onClick={closeAya}
        />
      )}
      <aside
        className={"aya-quake" + (open ? " open" : "")}
        aria-hidden={!open}
        inert={!open}
        role="dialog"
        aria-label={ayaName}
      >
        {/* Header */}
        <div
          className="row gap-2"
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--line-soft)",
            flexShrink: 0,
          }}
        >
          <span className="aya-orb" />
          <span className="serif" style={{ fontSize: 15, fontWeight: 460, flex: 1 }}>
            {ayaName}
          </span>
          <span className="meta" style={{ color: "var(--fg-faint)", fontSize: 11 }}>
            {chat.isPending ? "thinking…" : "idle"}
          </span>
          <button
            type="button"
            className="iconbtn"
            onClick={() => void handleNew()}
            disabled={newConv.isPending}
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus size={16} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={closeAya}
            title="Close Aya (Esc)"
            aria-label="Close Aya"
          >
            <span
              style={{
                fontSize: 16,
                lineHeight: 1,
                color: "var(--fg-dim)",
                fontFamily: "var(--mono)",
              }}
            >
              ×
            </span>
          </button>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            maxWidth: 900,
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          {isEmpty && <AssistantBubble text={greeting} />}
          {serverMessages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={conversationMessageKey(m)} text={m.text} />
            ) : (
              <div
                key={conversationMessageKey(m)}
                style={{ alignSelf: "flex-start", maxWidth: "88%" }}
              >
                <AssistantBubble text={m.text} error={m.error} />
                {m.writes.length > 0 && m.run_id && (
                  <WritesCard
                    writes={m.writes}
                    runId={m.run_id}
                    reverted={revertedIds.has(m.run_id)}
                    onReverted={() =>
                      setRevertedIds((prev) => new Set([...prev, m.run_id!]))
                    }
                  />
                )}
              </div>
            ),
          )}
          {pending && <UserBubble text={pending} />}
          {chat.isPending && (
            <div
              style={{
                alignSelf: "flex-start",
                background:
                  "linear-gradient(135deg, var(--signal-ghost), oklch(0.80 0.13 215 / 0.06))",
                border: "1px solid var(--signal-ghost)",
                borderRadius: "0 var(--r-md) var(--r-md) var(--r-md)",
                padding: "10px 16px",
              }}
            >
              <span className="dots" style={{ color: "var(--signal)" }}>
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid var(--line-soft)",
            flexShrink: 0,
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            width: "100%",
            maxWidth: 900,
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          <input
            ref={inputRef}
            className="input"
            placeholder="Message Aya…  (/new for a fresh thread)"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            disabled={chat.isPending}
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            className="iconbtn"
            onClick={() => void handleSend()}
            disabled={!msg.trim() || chat.isPending}
            title="Send"
            aria-label="Send"
            style={{ opacity: !msg.trim() || chat.isPending ? 0.4 : 1, flexShrink: 0 }}
          >
            <Send size={15} strokeWidth={1.6} />
          </button>
        </div>
      </aside>
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        alignSelf: "flex-end",
        maxWidth: "88%",
        background: "var(--surface-3)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md) var(--r-md) 0 var(--r-md)",
        padding: "9px 13px",
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--fg)",
      }}
    >
      {text}
    </div>
  );
}

function AssistantBubble({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        maxWidth: "88%",
        background: error
          ? "oklch(0.40 0.08 25 / 0.15)"
          : "linear-gradient(135deg, var(--signal-ghost), oklch(0.80 0.13 215 / 0.06))",
        border: error ? "1px solid oklch(0.55 0.12 25 / 0.4)" : "1px solid var(--signal-ghost)",
        borderRadius: "0 var(--r-md) var(--r-md) var(--r-md)",
        padding: "10px 13px",
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--fg-muted)",
      }}
    >
      <Markdown>{text}</Markdown>
    </div>
  );
}

import { Loader2, Plus, Send, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Markdown } from "./Markdown";
import { useMe } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useAya } from "../features/agent/AyaContext";
import { MAX_CHAT_MESSAGE_CHARS, chatMessageTooLongText } from "../features/agent/limits";
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
const FAILED_MESSAGE_PREVIEW_CHARS = 240;

function failedUserText(text: string): string {
  if (text.length <= MAX_CHAT_MESSAGE_CHARS) return text;
  return `Message not sent because it was too large (${text.length.toLocaleString()} characters).`;
}

function chatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return "That message is too large for chat. Shorten it or split it into smaller parts.";
    }
    if (error.status === 408 || error.status === 504) {
      return "Aya timed out while handling that message. Try a shorter version.";
    }
    if (error.status >= 500) {
      return "Aya hit a server error while handling that message. Try a shorter version.";
    }
  }
  return "Something went wrong. Please try again.";
}

function failedUserPreview(text: string): string {
  if (text.length <= FAILED_MESSAGE_PREVIEW_CHARS) return text;
  return `${text.slice(0, FAILED_MESSAGE_PREVIEW_CHARS).trimEnd()}...`;
}

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
    <div className="card aya-writes-card">
      <div className={"aya-writes-list" + (reverted ? " reverted" : "")}>
        {writes.map((w) => (
          <span key={w.id} className="row gap-1 aya-write-row">
            <span className="spark aya-write-spark">✦</span>
            <span className="aya-write-label">
              {w.action} {w.entity_type.replace("_", " ")}
            </span>
          </span>
        ))}
      </div>
      {!reverted ? (
        <button
          type="button"
          onClick={() => void handleUndo()}
          disabled={revert.isPending}
          className="btn ghost sm aya-undo-button"
        >
          {revert.isPending ? (
            <Loader2 size={11} strokeWidth={1.6} className="spin-icon" />
          ) : (
            <Undo2 size={11} strokeWidth={1.6} />
          )}
          Undo
        </button>
      ) : (
        <span className="aya-reverted-label">
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ayaName = persona?.name?.trim() || "Aya";
  const greeting = persona?.greeting?.trim() || DEFAULT_GREETING;
  const serverMessages = useMemo(() => conv.data?.messages ?? [], [conv.data?.messages]);
  const trimmedLength = msg.trim().length;
  const messageTooLong = trimmedLength > MAX_CHAT_MESSAGE_CHARS;
  const composerNotice = messageTooLong ? chatMessageTooLongText(trimmedLength) : null;

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel(e: Event) {
      e.preventDefault();
      closeAya();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [open, closeAya]);

  // Focus the composer when the window opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the composer tall enough for the current draft without letting it
  // consume the whole quake window.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [msg, open]);

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
    if (text.length > MAX_CHAT_MESSAGE_CHARS) return;
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
    } catch (error) {
      const userText = failedUserText(text);
      appendTurns(
        [
          { role: "user", text: failedUserPreview(userText), writes: [], run_id: null },
          {
            role: "assistant",
            text: chatErrorMessage(error),
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
    <dialog
      ref={dialogRef}
      className={"aya-quake" + (open ? " open" : "")}
      aria-hidden={!open}
      inert={!open}
      aria-label={ayaName}
    >
      {open && (
        <button
          type="button"
          className="aya-quake-scrim"
          aria-label="Close Aya"
          tabIndex={-1}
          onClick={closeAya}
        />
      )}
      <section className="aya-quake-panel">
        {/* Header */}
        <div className="row gap-2 aya-quake-header">
          <span className="aya-orb" />
          <span className="serif aya-title">
            {ayaName}
          </span>
          <span className="meta aya-status">
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
            <span className="aya-close-mark">×</span>
          </button>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="aya-transcript"
        >
          {isEmpty && <AssistantBubble text={greeting} />}
          {serverMessages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={conversationMessageKey(m)} text={m.text} />
            ) : (
              <div
                key={conversationMessageKey(m)}
                className="aya-assistant-message-wrap"
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
            <div className="aya-pending-bubble">
              <span className="dots aya-thinking-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="aya-composer">
          <textarea
            ref={inputRef}
            className="input aya-composer-input"
            placeholder="Message Aya…  (/new for a fresh thread)"
            aria-label="Message Aya"
            aria-invalid={messageTooLong}
            aria-describedby={composerNotice ? "aya-composer-notice" : undefined}
            rows={1}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            disabled={chat.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          {composerNotice && (
            <div id="aya-composer-notice" className="aya-composer-notice" role="alert">
              {composerNotice}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!msg.trim() || messageTooLong || chat.isPending}
            title="Send"
            aria-label="Send"
            className="iconbtn aya-send-button"
          >
            <Send size={15} strokeWidth={1.6} />
          </button>
        </div>
      </section>
    </dialog>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="aya-bubble aya-bubble-user">
      {text}
    </div>
  );
}

function AssistantBubble({ text, error }: { text: string; error?: boolean }) {
  return (
    <div className={"aya-bubble aya-bubble-assistant" + (error ? " error" : "")}>
      <Markdown>{text}</Markdown>
    </div>
  );
}

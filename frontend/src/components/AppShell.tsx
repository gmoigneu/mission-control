import {
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  Flame,
  FolderKanban,
  Inbox,
  Layers,
  LayoutDashboard,
  Link2,
  Loader2,
  Menu,
  Mic,
  Moon,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  SquareCheckBig,
  StickyNote,
  Sun,
  Tag,
  Tags,
  Target,
  Undo2,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLogout, useMe } from "../lib/auth";
import { useFocusTrap } from "../lib/useFocusTrap";
import {
  type AgentWrite,
  invalidateForWrites,
  useCapture,
  useChat,
  useRevertRun,
} from "../features/agent/api";

// ─── Nav definition ───────────────────────────────────────────────────────────

type NavEntry =
  | { divider: true }
  | {
      divider?: false;
      key: string;
      label: string;
      to: string;
      Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    };

const NAV: NavEntry[] = [
  { key: "dashboard", label: "Dashboard", to: "/", Icon: LayoutDashboard },
  { key: "contexts", label: "Contexts", to: "/contexts", Icon: Layers },
  { key: "projects", label: "Projects", to: "/projects", Icon: FolderKanban },
  { key: "people", label: "People", to: "/people", Icon: Users },
  { key: "companies", label: "Companies", to: "/companies", Icon: Building2 },
  { key: "tasks", label: "Tasks", to: "/tasks", Icon: SquareCheckBig },
  { key: "journal", label: "Journal", to: "/journal", Icon: NotebookPen },
  { key: "reviews", label: "Reviews", to: "/reviews", Icon: ClipboardCheck },
  { key: "habits", label: "Habits", to: "/habits", Icon: Flame },
  { key: "meetings", label: "Meetings", to: "/meetings", Icon: CalendarDays },
  { key: "knowledge", label: "Knowledge", to: "/knowledge", Icon: BookOpen },
  { key: "inbox", label: "Inbox", to: "/inbox", Icon: Inbox },
  { key: "telos", label: "TELOS", to: "/telos", Icon: Target },
  { divider: true },
  { key: "relationships", label: "Relationships", to: "/relationships", Icon: Share2 },
  { key: "observations", label: "Observations", to: "/observations", Icon: StickyNote },
  { key: "tags", label: "Tags", to: "/tags", Icon: Tag },
  { key: "entity-tags", label: "Entity Tags", to: "/entity-tags", Icon: Tags },
  { key: "entity-links", label: "Entity Links", to: "/entity-links", Icon: Link2 },
  { divider: true },
  { key: "search", label: "Search", to: "/search", Icon: Search },
  { key: "activity", label: "Activity", to: "/activity", Icon: Activity },
  { key: "settings", label: "Settings", to: "/settings", Icon: Settings },
];

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  text: string;
  undo?: boolean;
  onUndo?: () => void | Promise<void>;
}

// ─── Local components ─────────────────────────────────────────────────────────

function Logo() {
  return (
    <span
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: "var(--surface-3)",
        border: "1px solid var(--line-bright)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 9,
          background: "var(--signal)",
          boxShadow: "0 0 10px var(--signal-halo)",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 5,
          border: "1px solid var(--line-bright)",
          borderRadius: 5,
          opacity: 0.6,
        }}
      />
    </span>
  );
}

function NavItemComp({
  entry,
  active,
  open,
  onClick,
}: {
  entry: Extract<NavEntry, { divider?: false }>;
  active: boolean;
  open: boolean;
  onClick: () => void;
}) {
  const { Icon: IconComp } = entry;
  return (
    <button
      onClick={onClick}
      className={"nav-item row gap-3" + (active ? " active" : "")}
      title={!open ? entry.label : ""}
      style={{
        width: "100%",
        padding: open ? "8px 12px" : "9px",
        borderRadius: "var(--r-sm)",
        border: 0,
        cursor: "pointer",
        justifyContent: open ? "flex-start" : "center",
        background: active ? "var(--surface-3)" : "transparent",
        color: active ? "var(--fg)" : "var(--fg-dim)",
        marginBottom: 1,
        textAlign: "left",
        position: "relative",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 2.5,
            borderRadius: 9,
            background: "var(--signal)",
          }}
        />
      )}
      <IconComp size={17} strokeWidth={1.6} />
      {open && (
        <span style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>
          {entry.label}
        </span>
      )}
    </button>
  );
}

function BottomItemComp({
  Icon: IconComp,
  label,
  active,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="col"
      style={{
        alignItems: "center",
        gap: 3,
        border: 0,
        background: "transparent",
        cursor: "pointer",
        color: active ? "var(--signal)" : "var(--fg-dim)",
        padding: "4px 10px",
      }}
    >
      <IconComp size={20} strokeWidth={1.6} />
      <span
        style={{
          fontSize: 9.5,
          fontFamily: "var(--mono)",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function Toggle2({
  a,
  b,
  iconA,
  iconB,
  value,
  onChange,
  text,
}: {
  a: string;
  b: string;
  iconA?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  iconB?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  value: string;
  onChange: (v: string) => void;
  text?: boolean;
}) {
  return (
    <div
      className="row"
      style={{
        background: "var(--bg-deep)",
        borderRadius: "var(--r-sm)",
        padding: 2,
        border: "1px solid var(--line)",
      }}
    >
      {[a, b].map((opt, i) => {
        const IconComp = i === 0 ? iconA : iconB;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="row gap-1"
            style={{
              padding: text ? "4px 9px" : "4px 8px",
              borderRadius: 5,
              border: 0,
              cursor: "pointer",
              fontFamily: text ? "var(--mono)" : "var(--sans)",
              fontSize: text ? 10.5 : 12,
              letterSpacing: text ? "0.04em" : 0,
              textTransform: text ? "uppercase" : "none",
              background: value === opt ? "var(--surface-4)" : "transparent",
              color: value === opt ? "var(--fg)" : "var(--fg-dim)",
            }}
          >
            {!text && IconComp && <IconComp size={13} strokeWidth={1.6} />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SetRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 11,
      }}
    >
      <span style={{ fontSize: 13 }}>{label}</span>
      {children}
    </div>
  );
}

function SettingsPopover({
  theme,
  setTheme,
  navOpen,
  setNavOpen,
  close,
}: {
  theme: string;
  setTheme: (t: string) => void;
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
  close: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [close]);
  return (
    <>
      <div
        onClick={close}
        style={{ position: "fixed", inset: 0, zIndex: 41 }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Display settings"
        className="card rise"
        style={{
          position: "absolute",
          top: 50,
          right: 12,
          width: 268,
          padding: 16,
          zIndex: 42,
          boxShadow: "var(--shadow-pop)",
          background: "var(--surface-1)",
        }}
      >
        <div className="label" style={{ marginBottom: 12 }}>
          Display
        </div>
        <SetRow label="Theme">
          <Toggle2
            a="dark"
            b="light"
            iconA={Moon}
            iconB={Sun}
            value={theme}
            onChange={setTheme}
          />
        </SetRow>
        <SetRow label="Nav rail">
          <Toggle2
            a="full"
            b="icons"
            value={navOpen ? "full" : "icons"}
            onChange={(v) => setNavOpen(v === "full")}
            text
          />
        </SetRow>
        <div
          className="meta"
          style={{
            marginTop: 12,
            lineHeight: 1.4,
            color: "var(--fg-faint)",
          }}
        >
          Press ⌘K anywhere to capture. Drag task cards between board columns.
        </div>
      </div>
    </>
  );
}

function Avatar({
  initials,
  size = 30,
}: {
  initials: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--ctx-work)",
        color: "var(--signal-ink)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        fontFamily: "var(--mono)",
        letterSpacing: 0,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function AvatarMenu({
  email,
  onClose,
  onLogout,
}: {
  email: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 41 }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Account menu"
        className="card rise"
        style={{
          position: "absolute",
          top: 36,
          right: 0,
          width: 220,
          padding: "8px 0",
          zIndex: 42,
          boxShadow: "var(--shadow-pop)",
          background: "var(--surface-1)",
        }}
      >
        <div
          style={{
            padding: "8px 14px 10px",
            borderBottom: "1px solid var(--line-soft)",
            marginBottom: 4,
            fontSize: 12,
            color: "var(--fg-dim)",
            fontFamily: "var(--mono)",
          }}
        >
          {email}
        </div>
        <button
          onClick={onLogout}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: 0,
            padding: "7px 14px",
            fontSize: 13,
            cursor: "pointer",
            color: "var(--fg-muted)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--surface-3)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--fg)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--fg-muted)";
          }}
        >
          Log out
        </button>
      </div>
    </>
  );
}

function CommandPalette({
  onClose,
  onNavigate,
  onToast,
}: {
  onClose: () => void;
  onNavigate: (to: string) => void;
  onToast: (text: string, undo?: () => void) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const capture = useCapture();
  const revertRun = useRevertRun();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const navEntries = NAV.filter(
    (n): n is Extract<NavEntry, { divider?: false }> => !n.divider,
  );

  const filtered =
    query.trim()
      ? navEntries.filter((n) =>
          n.label.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : navEntries;

  function handleAction(to: string) {
    navigate({ to } as Parameters<typeof navigate>[0]);
    onNavigate(to);
    onClose();
  }

  function handleSearch() {
    navigate({
      to: "/search",
      search: { q: query.trim() },
    } as unknown as Parameters<typeof navigate>[0]);
    onClose();
  }

  async function handleCapture() {
    if (!query.trim()) return;
    try {
      const res = await capture.mutateAsync({ text: query.trim() });
      invalidateForWrites(qc, res.writes);
      onClose();
      const count = res.writes.length;
      onToast(
        `Aya created ${count} item${count !== 1 ? "s" : ""}`,
        async () => {
          await revertRun.mutateAsync(res.agent_run_id);
          invalidateForWrites(qc, res.writes);
        },
      );
    } catch {
      onToast("Aya capture failed");
    }
  }

  const isPending = capture.isPending;

  // Ordered list of selectable actions so ArrowUp/Down + Enter can drive the
  // palette from the keyboard. The input keeps DOM focus; selection is visual
  // and exposed via aria-activedescendant for assistive tech.
  const actions = useMemo(() => {
    const list: { id: string; run: () => void }[] = [];
    if (query.trim()) {
      list.push({ id: "cmdk-action-capture", run: () => void handleCapture() });
      list.push({ id: "cmdk-action-search", run: handleSearch });
    }
    for (const entry of filtered) {
      list.push({ id: `cmdk-nav-${entry.key}`, run: () => handleAction(entry.to) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filtered]);

  // Clamp the highlighted index to the current result set at render time — the
  // set shrinks/grows as the query changes, and we never want a stale index
  // pointing past the end.
  const selectedIndex =
    actions.length === 0 ? 0 : Math.min(activeIndex, actions.length - 1);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (actions.length > 0) {
        setActiveIndex((selectedIndex + 1) % actions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (actions.length > 0) {
        setActiveIndex((selectedIndex - 1 + actions.length) % actions.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = actions[selectedIndex];
      if (action) action.run();
      else if (query.trim()) void handleCapture();
    }
  }

  const activeId = actions[selectedIndex]?.id;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 80,
          background: "oklch(0.1 0.01 258 / 0.55)",
          backdropFilter: "blur(4px)",
        }}
      />
      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="card rise"
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(560px, 92vw)",
          zIndex: 81,
          padding: 16,
          boxShadow: "var(--shadow-pop)",
          background: "var(--surface-2)",
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <input
          ref={inputRef}
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Capture anything… or navigate"
          style={{ marginBottom: 12 }}
          disabled={isPending}
          role="combobox"
          aria-expanded={actions.length > 0}
          aria-controls="cmdk-listbox"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          onKeyDown={handleInputKeyDown}
        />
        <div
          id="cmdk-listbox"
          role="listbox"
          aria-label="Results"
          style={{
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {/* Primary: capture with Aya */}
          {query.trim() && (
            <button
              id="cmdk-action-capture"
              role="option"
              aria-selected={activeId === "cmdk-action-capture"}
              onClick={() => void handleCapture()}
              onMouseMove={() => setActiveIndex(0)}
              disabled={isPending}
              style={{
                textAlign: "left",
                background: isPending
                  ? "var(--surface-2)"
                  : activeId === "cmdk-action-capture"
                    ? "var(--surface-4)"
                    : "var(--surface-3)",
                border: "1px solid var(--signal-ghost)",
                borderRadius: "var(--r-sm)",
                padding: "8px 12px",
                cursor: isPending ? "default" : "pointer",
                fontSize: 13,
                color: "var(--signal)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? (
                <Loader2 size={14} strokeWidth={1.6} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Sparkles size={14} strokeWidth={1.6} />
              )}
              {isPending ? "Capturing…" : `✦ Capture with Aya: “${query}”`}
            </button>
          )}
          {/* Secondary: search */}
          {query.trim() && (
            <button
              id="cmdk-action-search"
              role="option"
              aria-selected={activeId === "cmdk-action-search"}
              onClick={handleSearch}
              onMouseMove={() => setActiveIndex(1)}
              style={{
                textAlign: "left",
                background:
                  activeId === "cmdk-action-search"
                    ? "var(--surface-3)"
                    : "transparent",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-sm)",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--fg-muted)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <Search size={14} strokeWidth={1.6} />
              Search for &ldquo;{query}&rdquo;
            </button>
          )}
          {filtered.map((entry, i) => {
            const optionId = `cmdk-nav-${entry.key}`;
            const navOffset = query.trim() ? 2 : 0;
            const selected = activeId === optionId;
            return (
              <button
                key={entry.key}
                id={optionId}
                role="option"
                aria-selected={selected}
                onClick={() => handleAction(entry.to)}
                onMouseMove={() => setActiveIndex(navOffset + i)}
                style={{
                  textAlign: "left",
                  background: selected ? "var(--surface-3)" : "transparent",
                  border: 0,
                  borderRadius: "var(--r-sm)",
                  padding: "7px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: selected ? "var(--fg)" : "var(--fg-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  transition:
                    "background var(--dur) var(--ease), color var(--dur) var(--ease)",
                }}
              >
                <entry.Icon size={15} strokeWidth={1.6} />
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Chat message types ───────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  writes?: AgentWrite[];
  runId?: string;
  error?: boolean;
  reverted?: boolean;
}

const INTRO_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Hi G — I’m Aya. Tell me what to do, and I’ll act on your data.",
};

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

function AyaPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE]);
  const [msg, setMsg] = useState("");
  const [revertedIds, setRevertedIds] = useState<Set<string>>(new Set());
  const transcriptRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const chat = useChat();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const text = msg.trim();
    if (!text || chat.isPending) return;
    setMsg("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    try {
      const res = await chat.mutateAsync({ message: text });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.reply,
          writes: res.writes.length > 0 ? res.writes : undefined,
          runId: res.agent_run_id,
        },
      ]);
      invalidateForWrites(qc, res.writes);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong. Please try again.", error: true },
      ]);
    }
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-1)",
        borderLeft: "1px solid var(--line-soft)",
      }}
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
        <span
          className="serif"
          style={{ fontSize: 15, fontWeight: 460, flex: 1 }}
        >
          Aya
        </span>
        <span className="meta" style={{ color: "var(--fg-faint)", fontSize: 11 }}>
          {chat.isPending ? "thinking…" : "idle"}
        </span>
        <button
          className="iconbtn"
          onClick={onClose}
          title="Close Aya"
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
        }}
      >
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
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
              {m.text}
            </div>
          ) : (
            <div key={i} style={{ alignSelf: "flex-start", maxWidth: "88%" }}>
              <div
                style={{
                  background: m.error
                    ? "oklch(0.40 0.08 25 / 0.15)"
                    : "linear-gradient(135deg, var(--signal-ghost), oklch(0.80 0.13 215 / 0.06))",
                  border: m.error
                    ? "1px solid oklch(0.55 0.12 25 / 0.4)"
                    : "1px solid var(--signal-ghost)",
                  borderRadius: "0 var(--r-md) var(--r-md) var(--r-md)",
                  padding: "10px 13px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--fg-muted)",
                }}
              >
                {m.text}
              </div>
              {m.writes && m.runId && (
                <WritesCard
                  writes={m.writes}
                  runId={m.runId}
                  reverted={revertedIds.has(m.runId)}
                  onReverted={() =>
                    setRevertedIds((prev) => new Set([...prev, m.runId!]))
                  }
                />
              )}
            </div>
          ),
        )}
        {/* Thinking indicator */}
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
        }}
      >
        <input
          className="input"
          placeholder="Message Aya…"
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
          className="iconbtn"
          onClick={() => void handleSend()}
          disabled={!msg.trim() || chat.isPending}
          title="Send"
          aria-label="Send"
          style={{
            opacity: !msg.trim() || chat.isPending ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <Send size={15} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}

// ─── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Persistent state
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mc-theme") ?? "dark";
    }
    return "dark";
  });
  const [navOpen, setNavOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mc-nav-open");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [ayaOpen, setAyaOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsJustClosed = useRef(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Sync theme to DOM + localStorage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mc-theme", theme);
  }, [theme]);

  // Sync navOpen to localStorage
  useEffect(() => {
    localStorage.setItem("mc-nav-open", String(navOpen));
  }, [navOpen]);

  // Global ⌘K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCaptureOpen(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function addToast(t: Omit<Toast, "id">) {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 7000);
  }

  function dismissToast(id: number) {
    setToasts((ts) => ts.filter((x) => x.id !== id));
  }

  function goTo(to: string) {
    navigate({ to } as Parameters<typeof navigate>[0]);
    setMobileNav(false);
  }

  const showDock = ayaOpen;
  const userInitial = me.data?.email?.[0]?.toUpperCase() ?? me.data?.name?.[0]?.toUpperCase() ?? "?";

  const gridCols =
    (navOpen ? "232px" : "60px") + " 1fr" + (showDock ? " 372px" : "");

  return (
    <div
      className="shell"
      style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gridTemplateRows: "56px 1fr",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* ===== Top bar ===== */}
      <header
        className="topbar"
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          borderBottom: "1px solid var(--line-soft)",
          background:
            "color-mix(in oklch, var(--surface-1) 88%, transparent)",
          backdropFilter: "blur(12px)",
          position: "relative",
          zIndex: 40,
        }}
      >
        {/* Logo + title */}
        <div
          className="row gap-3"
          style={{
            width: navOpen ? 216 : "auto",
            flexShrink: 0,
          }}
        >
          <button
            className="iconbtn mobile-only"
            onClick={() => setMobileNav((v) => !v)}
            aria-label="Open navigation"
          >
            <Menu size={18} strokeWidth={1.6} />
          </button>
          <div className="row gap-2">
            <Logo />
            <span
              className="serif desktop-only"
              style={{
                fontSize: 16,
                fontWeight: 460,
                letterSpacing: "-0.01em",
              }}
            >
              Mission Control
            </span>
          </div>
        </div>

        {/* Cmd-K capture trigger */}
        <button
          onClick={() => setCaptureOpen(true)}
          className="capture-trigger row gap-2"
          style={{
            flex: 1,
            maxWidth: 520,
            margin: "0 auto",
            background: "var(--bg-deep)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            padding: "8px 12px",
            cursor: "text",
            color: "var(--fg-faint)",
          }}
        >
          <Sparkles
            size={16}
            strokeWidth={1.6}
            style={{ color: "var(--signal)", flexShrink: 0 }}
          />
          <span
            style={{ flex: 1, textAlign: "left", fontSize: 13 }}
          >
            Capture anything…
          </span>
          <span
            className="badge desktop-only"
            style={{
              border: "1px solid var(--line)",
              color: "var(--fg-dim)",
            }}
          >
            ⌘K
          </span>
        </button>

        {/* Action buttons */}
        <div className="row gap-1" style={{ flexShrink: 0 }}>
          <button
            className="iconbtn"
            title="Voice capture"
            aria-label="Voice capture"
            onClick={() => addToast({ text: "Listening…", undo: false })}
          >
            <Mic size={18} strokeWidth={1.6} />
          </button>
          <button
            className="iconbtn"
            title="Settings"
            aria-label="Settings"
            onClick={() => {
              if (settingsJustClosed.current) {
                settingsJustClosed.current = false;
                return;
              }
              setSettingsOpen((v) => !v);
            }}
          >
            <Settings size={18} strokeWidth={1.6} />
          </button>
          {!showDock && (
            <button
              className="iconbtn"
              title="Open Aya"
              aria-label="Open Aya"
              onClick={() => setAyaOpen(true)}
              style={{ color: "var(--signal)" }}
            >
              <Sparkles size={18} strokeWidth={1.6} />
            </button>
          )}
          {/* Avatar / user menu */}
          <div style={{ position: "relative" }}>
            <button
              className="avatar-btn"
              title={me.data?.email ?? "Account"}
              aria-label="Account menu"
              onClick={() => setAvatarMenuOpen((v) => !v)}
            >
              <Avatar initials={userInitial} size={30} />
            </button>
            {avatarMenuOpen && (
              <AvatarMenu
                email={me.data?.email ?? ""}
                onClose={() => setAvatarMenuOpen(false)}
                onLogout={() => {
                  setAvatarMenuOpen(false);
                  logout.mutate();
                }}
              />
            )}
          </div>
        </div>

        {/* Settings popover */}
        {settingsOpen && (
          <SettingsPopover
            theme={theme}
            setTheme={setTheme}
            navOpen={navOpen}
            setNavOpen={setNavOpen}
            close={() => {
              settingsJustClosed.current = true;
              setSettingsOpen(false);
            }}
          />
        )}
      </header>

      {/* ===== Left nav ===== */}
      <nav
        className={"leftnav " + (mobileNav ? "mobile-open" : "")}
        style={{
          gridColumn: 1,
          gridRow: 2,
          borderRight: "1px solid var(--line-soft)",
          background: "var(--surface-1)",
          overflowY: "auto",
          overflowX: "hidden",
          padding: "12px 10px",
        }}
      >
        {NAV.map((n, i) =>
          "divider" in n && n.divider ? (
            <div key={i} className="hr" style={{ margin: "10px 8px" }} />
          ) : (
            <NavItemComp
              key={(n as Extract<NavEntry, { divider?: false }>).key}
              entry={n as Extract<NavEntry, { divider?: false }>}
              active={
                (n as Extract<NavEntry, { divider?: false }>).to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(
                      (n as Extract<NavEntry, { divider?: false }>).to,
                    )
              }
              open={navOpen}
              onClick={() =>
                goTo((n as Extract<NavEntry, { divider?: false }>).to)
              }
            />
          ),
        )}
        <button
          className="navrail-toggle desktop-only"
          onClick={() => setNavOpen((v) => !v)}
          title="Collapse"
          style={{ marginTop: 8 }}
        >
          {navOpen ? (
            <PanelLeft size={16} strokeWidth={1.6} />
          ) : (
            <PanelRight size={16} strokeWidth={1.6} />
          )}
          {navOpen && <span style={{ fontSize: 12 }}>Collapse</span>}
        </button>
      </nav>

      {/* Nav scrim (mobile) */}
      {mobileNav && (
        <div
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* ===== Content ===== */}
      <main
        style={{
          gridColumn: 2,
          gridRow: 2,
          overflow: "auto",
          minWidth: 0,
          position: "relative",
          background: "var(--bg)",
        }}
      >
        {children}
      </main>

      {/* ===== Docked Aya ===== */}
      {showDock && (
        <aside
          className="aya-dock desktop-only"
          style={{ overflow: "hidden", gridColumn: 3, gridRow: 2 }}
        >
          <AyaPanel onClose={() => setAyaOpen(false)} />
        </aside>
      )}

      {/* ===== Mobile bottom nav ===== */}
      <nav className="bottomnav mobile-only">
        <BottomItemComp
          Icon={LayoutDashboard}
          label="Today"
          active={pathname === "/"}
          onClick={() => goTo("/")}
        />
        <BottomItemComp
          Icon={SquareCheckBig}
          label="Tasks"
          active={pathname.startsWith("/tasks")}
          onClick={() => goTo("/tasks")}
        />
        <button
          className="bottom-fab"
          onClick={() => setCaptureOpen(true)}
          aria-label="Capture"
        >
          <Sparkles size={22} strokeWidth={1.6} />
        </button>
        <BottomItemComp
          Icon={NotebookPen}
          label="Journal"
          active={pathname.startsWith("/journal")}
          onClick={() => goTo("/journal")}
        />
        <BottomItemComp
          Icon={Sparkles}
          label="Aya"
          active={false}
          onClick={() => setAyaOpen(true)}
        />
      </nav>

      {/* ===== Command palette ===== */}
      {captureOpen && (
        <CommandPalette
          onClose={() => setCaptureOpen(false)}
          onNavigate={() => {}}
          onToast={(text, onUndo) =>
            addToast({ text, undo: !!onUndo, onUndo })
          }
        />
      )}

      {/* ===== Toasts ===== */}
      <div
        className="toast-stack"
        style={{
          position: "fixed",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 90,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast rise row gap-3"
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--line-bright)",
              borderRadius: "var(--r-md)",
              padding: "10px 12px 10px 14px",
              boxShadow: "var(--shadow-pop)",
              alignItems: "center",
              minWidth: 240,
            }}
          >
            {t.undo && (
              <span className="spark">
                <Sparkles size={14} strokeWidth={1.6} />
              </span>
            )}
            <span style={{ flex: 1, fontSize: 13 }}>{t.text}</span>
            {t.undo ? (
              <button
                className="btn ghost sm"
                onClick={async () => {
                  dismissToast(t.id);
                  if (t.onUndo) await t.onUndo();
                }}
              >
                <Undo2 size={12} strokeWidth={1.6} />
                Undo
              </button>
            ) : (
              <Check
                size={15}
                strokeWidth={1.6}
                style={{ color: "var(--st-done)" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

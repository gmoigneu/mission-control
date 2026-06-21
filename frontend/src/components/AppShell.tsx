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
  Network,
  MessageSquareQuote,
  Mic,
  Moon,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Search,
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
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useLogout, useMe } from "../lib/auth";
import {
  invalidateForWrites,
  useCapture,
  useRevertRun,
} from "../features/agent/api";
import { useAya } from "../features/agent/AyaContext";

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
  { key: "tones", label: "Tones", to: "/tones", Icon: MessageSquareQuote },
  { key: "tags", label: "Tags", to: "/tags", Icon: Tag },
  { key: "entity-tags", label: "Entity Tags", to: "/entity-tags", Icon: Tags },
  { key: "entity-links", label: "Entity Links", to: "/entity-links", Icon: Link2 },
  { divider: true },
  { key: "search", label: "Search", to: "/search", Icon: Search },
  { key: "graph", label: "Graph", to: "/graph", Icon: Network },
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
      type="button"
      onClick={onClick}
      className={
        "nav-item row gap-3" +
        (active ? " active" : "") +
        (open ? " nav-item-open" : " nav-item-closed")
      }
      title={!open ? entry.label : ""}
    >
      {active && <span className="nav-item-indicator" />}
      <IconComp size={17} strokeWidth={1.6} />
      {open && (
        <span className="nav-item-label">
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
      type="button"
      onClick={onClick}
      className={"bottom-item col" + (active ? " active" : "")}
    >
      <IconComp size={20} strokeWidth={1.6} />
      <span>{label}</span>
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
            type="button"
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

function useNativeDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
    }
    function handleCancel(e: Event) {
      e.preventDefault();
      close();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      if (dialog.open) dialog.close();
    };
  }, []);

  return dialogRef;
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
  const dialogRef = useNativeDialog(close);
  return (
    <dialog
      ref={dialogRef}
      aria-label="Display settings"
      aria-modal="true"
      className="shell-dialog shell-dialog-top"
    >
      <button
        type="button"
        aria-label="Close display settings"
        tabIndex={-1}
        onClick={close}
        className="shell-dialog-hitbox"
      />
      <div
        className="card rise shell-popover-card shell-popover-card-settings"
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
    </dialog>
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
  const dialogRef = useNativeDialog(onClose);
  return (
    <dialog
      ref={dialogRef}
      aria-label="Account menu"
      aria-modal="true"
      className="shell-dialog shell-dialog-top"
    >
      <button
        type="button"
        aria-label="Close account menu"
        tabIndex={-1}
        onClick={onClose}
        className="shell-dialog-hitbox"
      />
      <div
        className="card rise shell-popover-card shell-popover-card-account"
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
          type="button"
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
    </dialog>
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
  const dialogRef = useNativeDialog(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const capture = useCapture();
  const revertRun = useRevertRun();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
  const actions: { id: string; run: () => void }[] = [];
  if (query.trim()) {
    actions.push({ id: "cmdk-action-capture", run: () => void handleCapture() });
    actions.push({ id: "cmdk-action-search", run: handleSearch });
  }
  for (const entry of filtered) {
    actions.push({ id: `cmdk-nav-${entry.key}`, run: () => handleAction(entry.to) });
  }

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
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      aria-modal="true"
      className="shell-dialog shell-dialog-command"
    >
      <button
        type="button"
        aria-label="Close command palette"
        tabIndex={-1}
        onClick={onClose}
        className="shell-dialog-hitbox"
      />
      <div className="card rise shell-command-card">
        <input
          ref={inputRef}
          className="input shell-command-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Command palette search"
          placeholder="Capture anything… or navigate"
          disabled={isPending}
          aria-controls="cmdk-results"
          onKeyDown={handleInputKeyDown}
        />
        <div
          id="cmdk-results"
          className="cmdk-results"
        >
          {/* Primary: capture with Aya */}
          {query.trim() && (
            <button
              type="button"
              id="cmdk-action-capture"
              aria-current={
                activeId === "cmdk-action-capture" ? "true" : undefined
              }
              onClick={() => void handleCapture()}
              onMouseMove={() => setActiveIndex(0)}
              disabled={isPending}
              className={
                "cmdk-action cmdk-action-capture" +
                (activeId === "cmdk-action-capture" ? " selected" : "") +
                (isPending ? " pending" : "")
              }
            >
              {isPending ? (
                <Loader2
                  size={14}
                  strokeWidth={1.6}
                  className="spin-icon"
                />
              ) : (
                <Sparkles size={14} strokeWidth={1.6} />
              )}
              {isPending ? "Capturing…" : `✦ Capture with Aya: “${query}”`}
            </button>
          )}
          {/* Secondary: search */}
          {query.trim() && (
            <button
              type="button"
              id="cmdk-action-search"
              aria-current={
                activeId === "cmdk-action-search" ? "true" : undefined
              }
              onClick={handleSearch}
              onMouseMove={() => setActiveIndex(1)}
              className={
                "cmdk-action cmdk-action-search" +
                (activeId === "cmdk-action-search" ? " selected" : "")
              }
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
                type="button"
                key={entry.key}
                id={optionId}
                aria-current={selected ? "true" : undefined}
                onClick={() => handleAction(entry.to)}
                onMouseMove={() => setActiveIndex(navOffset + i)}
                className={"cmdk-nav-option" + (selected ? " selected" : "")}
              >
                <entry.Icon size={15} strokeWidth={1.6} />
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}

function TopBar({
  navOpen,
  email,
  userInitial,
  ayaOpen,
  avatarMenuOpen,
  settingsOpen,
  theme,
  onSetTheme,
  onSetNavOpen,
  onToggleMobileNav,
  onVoiceCapture,
  onToggleSettings,
  onToggleAya,
  onToggleAvatarMenu,
  onCloseAvatarMenu,
  onLogout,
  onCloseSettings,
}: {
  navOpen: boolean;
  email: string;
  userInitial: string;
  ayaOpen: boolean;
  avatarMenuOpen: boolean;
  settingsOpen: boolean;
  theme: string;
  onSetTheme: (theme: string) => void;
  onSetNavOpen: (open: boolean) => void;
  onToggleMobileNav: () => void;
  onVoiceCapture: () => void;
  onToggleSettings: () => void;
  onToggleAya: () => void;
  onToggleAvatarMenu: () => void;
  onCloseAvatarMenu: () => void;
  onLogout: () => void;
  onCloseSettings: () => void;
}) {
  const brandStyle = {
    "--topbar-brand-width": navOpen ? "216px" : "auto",
  } as CSSProperties;

  return (
    <header className="topbar">
      <div className="row gap-3 topbar-brand" style={brandStyle}>
        <button
          type="button"
          className="iconbtn mobile-only"
          onClick={onToggleMobileNav}
          aria-label="Open navigation"
        >
          <Menu size={18} strokeWidth={1.6} />
        </button>
        <div className="row gap-2">
          <Logo />
          <span className="serif desktop-only topbar-title">
            Mission Control
          </span>
        </div>
      </div>

      <div className="row gap-1 topbar-actions">
        <button
          type="button"
          className="iconbtn"
          title="Voice capture"
          aria-label="Voice capture"
          onClick={onVoiceCapture}
        >
          <Mic size={18} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="iconbtn"
          title="Settings"
          aria-label="Settings"
          onClick={onToggleSettings}
        >
          <Settings size={18} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="iconbtn signal"
          title="Toggle Aya (Ctrl+`)"
          aria-label="Toggle Aya"
          aria-pressed={ayaOpen}
          onClick={onToggleAya}
        >
          <Sparkles size={18} strokeWidth={1.6} />
        </button>
        <div className="avatar-anchor">
          <button
            type="button"
            className="avatar-btn"
            title={email || "Account"}
            aria-label="Account menu"
            onClick={onToggleAvatarMenu}
          >
            <Avatar initials={userInitial} size={30} />
          </button>
          {avatarMenuOpen && (
            <AvatarMenu
              email={email}
              onClose={onCloseAvatarMenu}
              onLogout={onLogout}
            />
          )}
        </div>
      </div>

      {settingsOpen && (
        <SettingsPopover
          theme={theme}
          setTheme={onSetTheme}
          navOpen={navOpen}
          setNavOpen={onSetNavOpen}
          close={onCloseSettings}
        />
      )}
    </header>
  );
}

function SideNav({
  pathname,
  navOpen,
  mobileNav,
  onNavigate,
  onToggleNavOpen,
}: {
  pathname: string;
  navOpen: boolean;
  mobileNav: boolean;
  onNavigate: (to: string) => void;
  onToggleNavOpen: () => void;
}) {
  return (
    <nav className={"leftnav " + (mobileNav ? "mobile-open" : "")}>
      {NAV.map((n, i) =>
        "divider" in n && n.divider ? (
          <div key={i} className="hr leftnav-divider" />
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
              onNavigate((n as Extract<NavEntry, { divider?: false }>).to)
            }
          />
        ),
      )}
      <button
        type="button"
        className="navrail-toggle navrail-toggle-offset desktop-only"
        onClick={onToggleNavOpen}
        title="Collapse"
      >
        {navOpen ? (
          <PanelLeft size={16} strokeWidth={1.6} />
        ) : (
          <PanelRight size={16} strokeWidth={1.6} />
        )}
        {navOpen && <span>Collapse</span>}
      </button>
    </nav>
  );
}

function MobileBottomNav({
  pathname,
  ayaOpen,
  onNavigate,
  onCapture,
  onOpenAya,
}: {
  pathname: string;
  ayaOpen: boolean;
  onNavigate: (to: string) => void;
  onCapture: () => void;
  onOpenAya: () => void;
}) {
  return (
    <nav className="bottomnav mobile-only">
      <BottomItemComp
        Icon={LayoutDashboard}
        label="Today"
        active={pathname === "/"}
        onClick={() => onNavigate("/")}
      />
      <BottomItemComp
        Icon={SquareCheckBig}
        label="Tasks"
        active={pathname.startsWith("/tasks")}
        onClick={() => onNavigate("/tasks")}
      />
      <button
        type="button"
        className="bottom-fab"
        onClick={onCapture}
        aria-label="Capture"
      >
        <Sparkles size={22} strokeWidth={1.6} />
      </button>
      <BottomItemComp
        Icon={NotebookPen}
        label="Journal"
        active={pathname.startsWith("/journal")}
        onClick={() => onNavigate("/journal")}
      />
      <BottomItemComp
        Icon={Sparkles}
        label="Aya"
        active={ayaOpen}
        onClick={onOpenAya}
      />
    </nav>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast rise row gap-3">
          {t.undo && (
            <span className="spark">
              <Sparkles size={14} strokeWidth={1.6} />
            </span>
          )}
          <span className="toast-message">{t.text}</span>
          {t.undo ? (
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                onDismiss(t.id);
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
              className="toast-success-icon"
            />
          )}
        </div>
      ))}
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
  // Aya is a bottom "quake" window mounted once at the route root; AppShell only
  // holds the buttons that toggle it, via shared context.
  const aya = useAya();
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

  const userInitial = me.data?.email?.[0]?.toUpperCase() ?? me.data?.name?.[0]?.toUpperCase() ?? "?";

  const shellStyle = {
    "--shell-nav-width": navOpen ? "232px" : "60px",
  } as CSSProperties;

  return (
    <div className="shell" style={shellStyle}>
      <TopBar
        navOpen={navOpen}
        email={me.data?.email ?? ""}
        userInitial={userInitial}
        ayaOpen={aya.open}
        avatarMenuOpen={avatarMenuOpen}
        settingsOpen={settingsOpen}
        theme={theme}
        onSetTheme={setTheme}
        onSetNavOpen={setNavOpen}
        onToggleMobileNav={() => setMobileNav((v) => !v)}
        onVoiceCapture={() => addToast({ text: "Listening…", undo: false })}
        onToggleSettings={() => {
          if (settingsJustClosed.current) {
            settingsJustClosed.current = false;
            return;
          }
          setSettingsOpen((v) => !v);
        }}
        onToggleAya={aya.toggle}
        onToggleAvatarMenu={() => setAvatarMenuOpen((v) => !v)}
        onCloseAvatarMenu={() => setAvatarMenuOpen(false)}
        onLogout={() => {
          setAvatarMenuOpen(false);
          logout.mutate();
        }}
        onCloseSettings={() => {
          settingsJustClosed.current = true;
          setSettingsOpen(false);
        }}
      />

      <SideNav
        pathname={pathname}
        navOpen={navOpen}
        mobileNav={mobileNav}
        onNavigate={goTo}
        onToggleNavOpen={() => setNavOpen((v) => !v)}
      />

      {/* Nav scrim (mobile) */}
      {mobileNav && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => setMobileNav(false)}
        />
      )}

      <main className="shell-main">{children}</main>

      {/* Aya itself is the bottom quake window, mounted once at the route root
          (see routes/root.tsx) so it survives navigation. */}

      <MobileBottomNav
        pathname={pathname}
        ayaOpen={aya.open}
        onNavigate={goTo}
        onCapture={() => setCaptureOpen(true)}
        onOpenAya={aya.openAya}
      />

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

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

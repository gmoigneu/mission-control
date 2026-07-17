import {
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  Building2,
  CalendarCheck,
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
  useReducer,
  useState,
} from "react";
import { useLogout, useMe } from "../lib/auth";
import {
  type CaptureCandidate,
  type CaptureResponse,
  invalidateForWrites,
  useApplyCapture,
  useCapture,
  useDismissCapture,
  useInboxCapture,
  useRevertRun,
} from "../features/agent/api";
import { useAya } from "../features/agent/AyaContext";

// ─── Nav definition ───────────────────────────────────────────────────────────

type NavEntry =
  | { divider: true; key: string }
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
  { key: "planning", label: "Planning", to: "/planning", Icon: CalendarCheck },
  { key: "journal", label: "Journal", to: "/journal", Icon: NotebookPen },
  { key: "reviews", label: "Reviews", to: "/reviews", Icon: ClipboardCheck },
  { key: "habits", label: "Habits", to: "/habits", Icon: Flame },
  { key: "meetings", label: "Meetings", to: "/meetings", Icon: CalendarDays },
  { key: "knowledge", label: "Knowledge", to: "/knowledge", Icon: BookOpen },
  { key: "inbox", label: "Inbox", to: "/inbox", Icon: Inbox },
  { key: "telos", label: "TELOS", to: "/telos", Icon: Target },
  { divider: true, key: "primary-secondary" },
  { key: "relationships", label: "Relationships", to: "/relationships", Icon: Share2 },
  { key: "observations", label: "Observations", to: "/observations", Icon: StickyNote },
  { key: "tones", label: "Tones", to: "/tones", Icon: MessageSquareQuote },
  { key: "tags", label: "Tags", to: "/tags", Icon: Tag },
  { key: "entity-tags", label: "Entity Tags", to: "/entity-tags", Icon: Tags },
  { key: "entity-links", label: "Entity Links", to: "/entity-links", Icon: Link2 },
  { divider: true, key: "secondary-utility" },
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

const CAPTURE_EDITABLE_FIELDS = new Set(["title", "body", "due", "status", "priority"]);

interface CapturePreviewState {
  preview: CaptureResponse | null;
  selectedIds: Set<string>;
  draftFields: Record<string, Record<string, unknown>>;
}

type CapturePreviewAction =
  | { type: "show"; response: CaptureResponse }
  | { type: "clear" }
  | { type: "toggle"; actionId: string; selected: boolean }
  | { type: "draft"; actionId: string; field: string; value: string };

const EMPTY_CAPTURE_PREVIEW: CapturePreviewState = {
  preview: null,
  selectedIds: new Set(),
  draftFields: {},
};

function capturePreviewReducer(
  state: CapturePreviewState,
  action: CapturePreviewAction,
): CapturePreviewState {
  if (action.type === "clear") return EMPTY_CAPTURE_PREVIEW;
  if (action.type === "show") {
    const initiallySelected: string[] = [];
    const draftFields: Record<string, Record<string, unknown>> = {};
    for (const proposed of action.response.result.proposed_actions) {
      if (proposed.selected) initiallySelected.push(proposed.id);
      draftFields[proposed.id] = proposed.fields;
    }
    return {
      preview: action.response,
      selectedIds: new Set(initiallySelected),
      draftFields,
    };
  }
  if (action.type === "toggle") {
    const selectedIds = new Set(state.selectedIds);
    if (action.selected) selectedIds.add(action.actionId);
    else selectedIds.delete(action.actionId);
    return { ...state, selectedIds };
  }
  return {
    ...state,
    draftFields: {
      ...state.draftFields,
      [action.actionId]: {
        ...(state.draftFields[action.actionId] ?? {}),
        [action.field]: action.value,
      },
    },
  };
}

interface ShellState {
  theme: string;
  navOpen: boolean;
  mobileNav: boolean;
  settingsOpen: boolean;
  avatarMenuOpen: boolean;
  captureOpen: boolean;
  toasts: Toast[];
}

type ShellAction =
  | { type: "setTheme"; theme: string }
  | { type: "setNavOpen"; open: boolean }
  | { type: "toggleMobileNav" }
  | { type: "closeMobileNav" }
  | { type: "toggleSettings" }
  | { type: "closeSettings" }
  | { type: "toggleAvatarMenu" }
  | { type: "closeAvatarMenu" }
  | { type: "openCapture" }
  | { type: "closeCapture" }
  | { type: "addToast"; toast: Toast }
  | { type: "dismissToast"; id: number };

function initialShellState(): ShellState {
  let theme = "dark";
  let navOpen = true;
  if (typeof window !== "undefined") {
    theme = localStorage.getItem("mc-theme") ?? "dark";
    const savedNavOpen = localStorage.getItem("mc-nav-open");
    navOpen = savedNavOpen !== null ? savedNavOpen === "true" : true;
  }
  return {
    theme,
    navOpen,
    mobileNav: false,
    settingsOpen: false,
    avatarMenuOpen: false,
    captureOpen: false,
    toasts: [],
  };
}

function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case "setTheme":
      return { ...state, theme: action.theme };
    case "setNavOpen":
      return { ...state, navOpen: action.open };
    case "toggleMobileNav":
      return { ...state, mobileNav: !state.mobileNav };
    case "closeMobileNav":
      return { ...state, mobileNav: false };
    case "toggleSettings":
      return { ...state, settingsOpen: !state.settingsOpen };
    case "closeSettings":
      return { ...state, settingsOpen: false };
    case "toggleAvatarMenu":
      return { ...state, avatarMenuOpen: !state.avatarMenuOpen };
    case "closeAvatarMenu":
      return { ...state, avatarMenuOpen: false };
    case "openCapture":
      return { ...state, captureOpen: true };
    case "closeCapture":
      return { ...state, captureOpen: false };
    case "addToast":
      return { ...state, toasts: [...state.toasts, action.toast] };
    case "dismissToast":
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.id),
      };
  }
}

// ─── Local components ─────────────────────────────────────────────────────────

function Logo() {
  return (
    <span className="app-logo">
      <span className="app-logo-core" />
      <span className="app-logo-frame" />
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
    <div className="row toggle2">
      {[a, b].map((opt, i) => {
        const IconComp = i === 0 ? iconA : iconB;
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(opt)}
            className={
              "row gap-1 toggle2-option" +
              (text ? " text" : "") +
              (value === opt ? " active" : "")
            }
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
    <div className="row settings-row">
      <span className="settings-row-label">{label}</span>
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
        <div className="label settings-title">
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
        <div className="meta settings-hint">
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
  const avatarStyle = {
    "--avatar-size": `${size}px`,
    "--avatar-font-size": `${size * 0.4}px`,
  } as CSSProperties;

  return (
    <span className="avatar" style={avatarStyle}>
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
        <div className="account-menu-email">
          {email}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="account-menu-action"
        >
          Log out
        </button>
      </div>
    </dialog>
  );
}

function CapturePreviewPanel({
  preview,
  selectedIds,
  draftFields,
  isPending,
  selectedCount,
  onToggle,
  onDraft,
  onDismiss,
  onSendToInbox,
  onApplySelected,
  onApplyAll,
}: {
  preview: CaptureResponse;
  selectedIds: Set<string>;
  draftFields: Record<string, Record<string, unknown>>;
  isPending: boolean;
  selectedCount: number;
  onToggle: (actionId: string, selected: boolean) => void;
  onDraft: (actionId: string, field: string, value: string) => void;
  onDismiss: () => void;
  onSendToInbox: () => void;
  onApplySelected: () => void;
  onApplyAll: () => void;
}) {
  return (
    <section
      aria-label="Capture preview"
      style={{
        borderTop: "1px solid var(--line-soft)",
        borderBottom: "1px solid var(--line-soft)",
        padding: "12px 0",
        marginBottom: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div className="row gap-2" style={{ alignItems: "flex-start" }}>
        <Sparkles size={15} strokeWidth={1.6} style={{ color: "var(--signal)", marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 520 }}>
            {preview.result.suggested_next_action}
          </div>
          <div className="meta" style={{ fontSize: 12 }}>
            Confidence {Math.round(preview.result.confidence * 100)}%
            {preview.result.ambiguity_notes.length > 0
              ? ` · ${preview.result.ambiguity_notes.join(" ")}`
              : ""}
          </div>
        </div>
      </div>
      {preview.result.proposed_actions.map((action) => {
        const fields = draftFields[action.id] ?? action.fields;
        const checked = selectedIds.has(action.id);
        const editableFields: [string, unknown][] = [];
        for (const [key, value] of Object.entries(fields)) {
          if (CAPTURE_EDITABLE_FIELDS.has(key) && value != null) {
            editableFields.push([key, value]);
          }
        }
        return (
          <div
            key={action.id}
            style={{
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              padding: 10,
              background: "var(--surface-1)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <label className="row gap-2" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onToggle(action.id, e.target.checked)}
              />
              <span style={{ color: "var(--fg)" }}>{action.entity_type.replace("_", " ")}</span>
              <span className="meta">{Math.round(action.confidence * 100)}%</span>
            </label>
            {editableFields.map(([key, value]) => (
              <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="meta" style={{ textTransform: "capitalize" }}>{key}</span>
                {key === "body" ? (
                  <textarea
                    className="input"
                    value={String(value)}
                    rows={3}
                    onChange={(e) => onDraft(action.id, key, e.target.value)}
                    style={{ resize: "vertical", minHeight: 70 }}
                  />
                ) : (
                  <input
                    className="input"
                    value={String(value)}
                    onChange={(e) => onDraft(action.id, key, e.target.value)}
                  />
                )}
              </label>
            ))}
            {action.missing_fields.length > 0 && (
              <div className="meta" style={{ color: "var(--danger, var(--fg-dim))" }}>
                Missing: {action.missing_fields.join(", ")}
              </div>
            )}
            {action.warnings.length > 0 && (
              <div className="meta">{action.warnings.join(" ")}</div>
            )}
          </div>
        );
      })}
      <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className="btn ghost sm" onClick={onDismiss} disabled={isPending}>
          Dismiss
        </button>
        <button type="button" className="btn ghost sm" onClick={onSendToInbox} disabled={isPending}>
          Send to inbox
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={onApplySelected}
          disabled={isPending || selectedCount === 0}
        >
          Apply selected
        </button>
        <button type="button" className="btn primary sm" onClick={onApplyAll} disabled={isPending}>
          Apply all
        </button>
      </div>
    </section>
  );
}

function CommandPaletteResults({
  query,
  activeId,
  isPending,
  filtered,
  onCapture,
  onSearch,
  onNavigate,
  onHoverIndex,
}: {
  query: string;
  activeId: string | undefined;
  isPending: boolean;
  filtered: Extract<NavEntry, { divider?: false }>[];
  onCapture: () => void;
  onSearch: () => void;
  onNavigate: (to: string) => void;
  onHoverIndex: (index: number) => void;
}) {
  const hasQuery = Boolean(query.trim());
  return (
    <div id="cmdk-results" className="cmdk-results">
      {hasQuery && (
        <button
          type="button"
          id="cmdk-action-capture"
          role="option"
          aria-selected={activeId === "cmdk-action-capture"}
          aria-current={activeId === "cmdk-action-capture" ? "true" : undefined}
          onClick={onCapture}
          onMouseMove={() => onHoverIndex(0)}
          disabled={isPending}
          className={
            "cmdk-action cmdk-action-capture" +
            (activeId === "cmdk-action-capture" ? " selected" : "") +
            (isPending ? " pending" : "")
          }
        >
          {isPending ? (
            <Loader2 size={14} strokeWidth={1.6} className="spin-icon" />
          ) : (
            <Sparkles size={14} strokeWidth={1.6} />
          )}
          {isPending ? "Capturing…" : `✦ Capture with Aya: “${query}”`}
        </button>
      )}
      {hasQuery && (
        <button
          type="button"
          id="cmdk-action-search"
          role="option"
          aria-selected={activeId === "cmdk-action-search"}
          aria-current={activeId === "cmdk-action-search" ? "true" : undefined}
          onClick={onSearch}
          onMouseMove={() => onHoverIndex(1)}
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
        const navOffset = hasQuery ? 2 : 0;
        const selected = activeId === optionId;
        return (
          <button
            type="button"
            key={entry.key}
            id={optionId}
            role="option"
            aria-selected={selected}
            aria-current={selected ? "true" : undefined}
            onClick={() => onNavigate(entry.to)}
            onMouseMove={() => onHoverIndex(navOffset + i)}
            className={"cmdk-nav-option" + (selected ? " selected" : "")}
          >
            <entry.Icon size={15} strokeWidth={1.6} />
            {entry.label}
          </button>
        );
      })}
    </div>
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
  const applyCapture = useApplyCapture();
  const inboxCapture = useInboxCapture();
  const dismissCapture = useDismissCapture();
  const revertRun = useRevertRun();
  const [previewState, dispatchPreview] = useReducer(
    capturePreviewReducer,
    EMPTY_CAPTURE_PREVIEW,
  );
  const { preview, selectedIds, draftFields } = previewState;

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
      if (res.capture.status === "previewed") {
        dispatchPreview({ type: "show", response: res });
        return;
      }
      onClose();
      const count = res.writes.length;
      onToast(
        res.capture.status === "inboxed"
          ? "Capture saved to inbox"
          : `Aya created ${count} item${count !== 1 ? "s" : ""}`,
        async () => {
          await revertRun.mutateAsync(res.agent_run_id);
          invalidateForWrites(qc, res.writes);
        },
      );
    } catch {
      onToast("Aya capture failed");
    }
  }

  function updateDraft(actionId: string, field: string, value: string) {
    dispatchPreview({ type: "draft", actionId, field, value });
  }

  function actionsForApply(selectAll = false): CaptureCandidate[] {
    if (!preview) return [];
    return preview.result.proposed_actions.map((action) => ({
      ...action,
      selected: selectAll || selectedIds.has(action.id),
      fields: draftFields[action.id] ?? action.fields,
    }));
  }

  async function handleApply(selectAll = false) {
    if (!preview) return;
    try {
      const res = await applyCapture.mutateAsync({
        captureId: preview.capture.id,
        actions: actionsForApply(selectAll),
      });
      invalidateForWrites(qc, res.writes);
      onClose();
      onToast("Capture applied", async () => {
        await revertRun.mutateAsync(res.agent_run_id);
        invalidateForWrites(qc, res.writes);
      });
    } catch {
      onToast("Capture apply failed");
    }
  }

  async function handleSendToInbox() {
    if (!preview) return;
    try {
      const res = await inboxCapture.mutateAsync({
        captureId: preview.capture.id,
        reason: preview.result.ambiguity_notes.join("; ") || "Sent from preview",
        suggested_action: preview.result.suggested_next_action,
      });
      invalidateForWrites(qc, res.writes);
      onClose();
      onToast("Capture saved to inbox");
    } catch {
      onToast("Could not save capture to inbox");
    }
  }

  async function handleDismiss() {
    if (!preview) return;
    try {
      const res = await dismissCapture.mutateAsync(preview.capture.id);
      invalidateForWrites(qc, res.writes);
      onClose();
      onToast("Capture dismissed");
    } catch {
      onToast("Could not dismiss capture");
    }
  }

  const isPending =
    capture.isPending || applyCapture.isPending || inboxCapture.isPending || dismissCapture.isPending;
  const selectedCount = selectedIds.size;

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
        {preview && (
          <CapturePreviewPanel
            preview={preview}
            selectedIds={selectedIds}
            draftFields={draftFields}
            isPending={isPending}
            selectedCount={selectedCount}
            onToggle={(actionId, selected) =>
              dispatchPreview({ type: "toggle", actionId, selected })
            }
            onDraft={updateDraft}
            onDismiss={() => void handleDismiss()}
            onSendToInbox={() => void handleSendToInbox()}
            onApplySelected={() => void handleApply(false)}
            onApplyAll={() => void handleApply(true)}
          />
        )}
        <CommandPaletteResults
          query={query}
          activeId={activeId}
          isPending={isPending}
          filtered={filtered}
          onCapture={() => void handleCapture()}
          onSearch={handleSearch}
          onNavigate={handleAction}
          onHoverIndex={setActiveIndex}
        />
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
  const navToggleLabel = navOpen ? "Collapse navigation" : "Expand navigation";

  return (
    <nav className={"leftnav " + (mobileNav ? "mobile-open" : "")}>
      {NAV.map((n) =>
        "divider" in n && n.divider ? (
          <div key={n.key} className="hr leftnav-divider" />
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
        title={navToggleLabel}
        aria-label={navToggleLabel}
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

  const [shell, dispatchShell] = useReducer(
    shellReducer,
    undefined,
    initialShellState,
  );
  const {
    theme,
    navOpen,
    mobileNav,
    settingsOpen,
    avatarMenuOpen,
    captureOpen,
    toasts,
  } = shell;
  // Aya is a bottom "quake" window mounted once at the route root; AppShell only
  // holds the buttons that toggle it, via shared context.
  const aya = useAya();
  const settingsJustClosed = useRef(false);

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
        dispatchShell({ type: "openCapture" });
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function addToast(t: Omit<Toast, "id">) {
    const id = Date.now() + Math.random();
    dispatchShell({ type: "addToast", toast: { ...t, id } });
    setTimeout(() => dispatchShell({ type: "dismissToast", id }), 7000);
  }

  function dismissToast(id: number) {
    dispatchShell({ type: "dismissToast", id });
  }

  function goTo(to: string) {
    navigate({ to } as Parameters<typeof navigate>[0]);
    dispatchShell({ type: "closeMobileNav" });
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
        onSetTheme={(nextTheme) =>
          dispatchShell({ type: "setTheme", theme: nextTheme })
        }
        onSetNavOpen={(open) => dispatchShell({ type: "setNavOpen", open })}
        onToggleMobileNav={() => dispatchShell({ type: "toggleMobileNav" })}
        onVoiceCapture={() => addToast({ text: "Listening…", undo: false })}
        onToggleSettings={() => {
          if (settingsJustClosed.current) {
            settingsJustClosed.current = false;
            return;
          }
          dispatchShell({ type: "toggleSettings" });
        }}
        onToggleAya={aya.toggle}
        onToggleAvatarMenu={() => dispatchShell({ type: "toggleAvatarMenu" })}
        onCloseAvatarMenu={() => dispatchShell({ type: "closeAvatarMenu" })}
        onLogout={() => {
          dispatchShell({ type: "closeAvatarMenu" });
          logout.mutate();
        }}
        onCloseSettings={() => {
          settingsJustClosed.current = true;
          dispatchShell({ type: "closeSettings" });
        }}
      />

      <SideNav
        pathname={pathname}
        navOpen={navOpen}
        mobileNav={mobileNav}
        onNavigate={goTo}
        onToggleNavOpen={() =>
          dispatchShell({ type: "setNavOpen", open: !navOpen })
        }
      />

      {/* Nav scrim (mobile) */}
      {mobileNav && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => dispatchShell({ type: "closeMobileNav" })}
        />
      )}

      <main className="shell-main">{children}</main>

      {/* Aya itself is the bottom quake window, mounted once at the route root
          (see routes/root.tsx) so it survives navigation. */}

      <MobileBottomNav
        pathname={pathname}
        ayaOpen={aya.open}
        onNavigate={goTo}
        onCapture={() => dispatchShell({ type: "openCapture" })}
        onOpenAya={aya.openAya}
      />

      {/* ===== Command palette ===== */}
      {captureOpen && (
        <CommandPalette
          onClose={() => dispatchShell({ type: "closeCapture" })}
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

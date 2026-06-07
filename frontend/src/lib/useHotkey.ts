import { useEffect, useRef } from "react";

/** True when the target is a field where typing should win over shortcuts. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * Fire `handler` when a bare `key` is pressed anywhere on the page.
 *
 * Ignores the shortcut while typing in a field (input/textarea/select/
 * contenteditable), on key-repeat, and when any modifier (⌘/Ctrl/Alt) is held,
 * so it never steals real keystrokes. Pass `enabled={false}` to suspend it
 * (e.g. while a dialog is open). The latest `handler` is always used without
 * re-subscribing the listener.
 */
export function useHotkey(key: string, handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== key || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      handlerRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, enabled]);
}

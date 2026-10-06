import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

interface ModalOverlayProps {
  // Omit (or pass undefined) while the dialog must not be dismissed, e.g.
  // mid-submit — Escape is then ignored.
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}

// Open dialogs, innermost last — so Escape only closes the topmost one
// when a ConfirmDialog is stacked on top of another modal.
const openStack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Design Brief §9 (keyboard-accessible controls): the shared backdrop for
// every modal in the app. Gives it dialog semantics, labels it by its
// first heading, moves focus inside on open and back to the trigger on
// close, keeps Tab cycling inside it, and closes it on Escape.
export function ModalOverlay({
  onClose,
  className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4",
  children,
}: ModalOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const token = Symbol("dialog");
    openStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const heading = root.querySelector("h1, h2, h3");
    if (heading) {
      if (!heading.id) heading.id = headingId;
      root.setAttribute("aria-labelledby", heading.id);
    }

    // With a mouse/keyboard, land on the first form field (where typing
    // starts). On touch screens focus the dialog itself instead —
    // focusing an input there would pop the on-screen keyboard
    // unprompted over the form.
    // (Skips display:none fields, e.g. a file input hidden behind a
    // styled "Upload photo" label, which can't take focus.)
    const firstField = window.matchMedia("(pointer: fine)").matches
      ? Array.from(
          root.querySelectorAll<HTMLElement>("input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])"),
        ).find((el) => el.offsetParent !== null)
      : undefined;
    (firstField ?? root).focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== token || !root) return;
      if (e.key === "Escape") {
        if (onCloseRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const i = openStack.indexOf(token);
      if (i !== -1) openStack.splice(i, 1);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [headingId]);

  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} className={`${className} outline-none`}>
      {children}
    </div>
  );
}

import { useEffect, useRef } from "react";

// Closes a popover/menu/drawer on Escape while `active` — the keyboard
// counterpart to the click-outside backdrops those menus already use.
// (Modals get this from ModalOverlay instead.)
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handlerRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);
}

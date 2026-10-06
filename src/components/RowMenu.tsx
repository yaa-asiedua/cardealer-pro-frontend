import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../lib/use-escape-key";

interface RowMenuProps {
  // The button that opened the menu — the menu lines up with its right
  // edge.
  anchor: HTMLElement;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

const GAP = 4;
const EDGE = 8;

// A table row's "Actions" dropdown. Rendered into <body> with fixed
// positioning rather than absolutely inside the row: every table sits in
// an overflow-x-auto wrapper (so it can scroll sideways on phones), and
// that wrapper clipped an in-row menu — on the last rows only "View /
// Edit" showed and Change Status/Delete were unreachable, on desktop too.
// Opens upward when there isn't room below and follows its button on
// scroll/resize. Closes on outside click or Escape.
export function RowMenu({ anchor, onClose, className = "w-44", children }: RowMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEscapeKey(true, onClose);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    function place() {
      if (!menu) return;
      const a = anchor.getBoundingClientRect();
      const { offsetWidth: w, offsetHeight: h } = menu;
      const below = a.bottom + GAP;
      const top = below + h > window.innerHeight - EDGE && a.top - GAP - h >= EDGE ? a.top - GAP - h : below;
      const left = Math.min(Math.max(a.right - w, EDGE), window.innerWidth - w - EDGE);
      setPos({ top, left });
    }
    place();

    // Follow the button if the page or the table scrolls (closing on
    // scroll instead was too eager: focusing the tapped button can itself
    // nudge a scroll container and shut the menu instantly).
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        role="menu"
        style={pos ?? { top: 0, left: 0, visibility: "hidden" }}
        className={`fixed z-50 rounded-xl border border-border bg-card py-1 text-left shadow-lg ${className}`}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

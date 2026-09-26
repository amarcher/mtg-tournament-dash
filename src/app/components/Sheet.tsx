"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom sheet: dimmed, blurred backdrop that closes on tap or Escape, with
 * the panel rising from the bottom edge above the home indicator. Portaled to
 * <body> because an ancestor with backdrop-filter (the sticky header) becomes
 * the containing block for `position: fixed` and would trap the sheet.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[3px] motion-safe:animate-[fade-in_180ms_ease-out]"
      />
      <div
        role="dialog"
        aria-label={label}
        className="relative mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] w-[calc(100%-1rem)] max-w-md rounded-[22px] border border-line bg-surface p-2 shadow-e3 motion-safe:animate-[sheet-up_260ms_var(--ease-out-expo)]"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export const sheetRowClass =
  "flex min-h-14 w-full items-center justify-between gap-3 rounded-[14px] px-4 text-left text-base font-semibold transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70";

"use client";

import { useCallback, useEffect, useState } from "react";

type Tile = {
  label: string;
  src: string;
};

type Props = {
  selfieUrl: string | null;
  freshUrl: string | null;
  woundedUrl: string | null;
  criticalUrl: string | null;
  victoryUrl: string | null;
  defeatUrl: string | null;
};

export function WizardGallery({
  selfieUrl,
  freshUrl,
  woundedUrl,
  criticalUrl,
  victoryUrl,
  defeatUrl,
}: Props) {
  const tiles: Tile[] = [
    selfieUrl ? { label: "original", src: selfieUrl } : null,
    freshUrl ? { label: "fresh", src: freshUrl } : null,
    woundedUrl ? { label: "wounded", src: woundedUrl } : null,
    criticalUrl ? { label: "critical", src: criticalUrl } : null,
    victoryUrl ? { label: "victory", src: victoryUrl } : null,
    defeatUrl ? { label: "defeat", src: defeatUrl } : null,
  ].filter((t): t is Tile => t !== null);

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const close = useCallback(() => setOpenIdx(null), []);

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight")
        setOpenIdx((i) => (i === null ? null : (i + 1) % tiles.length));
      if (e.key === "ArrowLeft")
        setOpenIdx((i) =>
          i === null ? null : (i - 1 + tiles.length) % tiles.length
        );
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [openIdx, close, tiles.length]);

  if (tiles.length === 0) return null;

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setOpenIdx(i)}
            aria-label={`Open ${t.label} portrait`}
            className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 transition hover:border-amber-500/60 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.src}
              alt=""
              className="h-full w-full object-cover transition group-hover:scale-[1.03]"
            />
            <span
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5 text-center text-[0.65rem] font-medium uppercase tracking-[0.2em] text-zinc-200"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {openIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${tiles[openIdx].label} portrait`}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-zinc-900/80 text-2xl text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800 hover:text-white"
          >
            ×
          </button>
          {tiles.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenIdx(
                    (i) =>
                      i === null
                        ? null
                        : (i - 1 + tiles.length) % tiles.length
                  );
                }}
                aria-label="Previous portrait"
                className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-zinc-900/80 text-2xl text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800 hover:text-white"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenIdx(
                    (i) => (i === null ? null : (i + 1) % tiles.length)
                  );
                }}
                aria-label="Next portrait"
                className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-zinc-900/80 text-2xl text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800 hover:text-white"
              >
                ›
              </button>
            </>
          )}
          <figure
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-full max-w-5xl flex-col items-center gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tiles[openIdx].src}
              alt=""
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            <figcaption className="text-xs uppercase tracking-[0.3em] text-zinc-400">
              {tiles[openIdx].label}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}

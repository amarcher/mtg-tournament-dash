export type DraftSeat = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
};

/**
 * Top-down view of the draft pod: seat 1 at twelve o'clock, numbered
 * clockwise. Clockwise is also "pass left" for a player facing the table, so
 * pack 1 travels seat 1 → 2 → 3. Sized entirely in container units so the
 * same markup fills a TV and fits a phone.
 */
export function DraftSeating({
  seats,
  setName,
  className = "",
}: {
  seats: DraftSeat[];
  setName?: string | null;
  className?: string;
}) {
  const n = seats.length;
  const radius = 34;
  // Shrink avatars as the pod grows so neighbors never overlap.
  const avatarCqi = Math.min(18, ((2 * Math.PI * radius) / Math.max(n, 1)) * 0.68);

  return (
    <div
      className={`relative aspect-square w-full ${className}`}
      style={{ containerType: "inline-size" }}
    >
      <div className="absolute left-1/2 top-1/2 flex aspect-square w-[38%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-amber-500/30 bg-[radial-gradient(circle_at_50%_40%,rgba(245,158,11,0.14),rgba(24,24,27,0.95)_70%)] text-center shadow-[0_0_60px_rgba(245,158,11,0.08)]">
        <div className="text-[3cqi] font-semibold uppercase tracking-[0.25em] text-amber-400">
          Draft pod
        </div>
        {setName && (
          <div className="mt-[0.8cqi] max-w-[80%] text-[2.2cqi] leading-tight text-zinc-300">
            {setName}
          </div>
        )}
        <div className="mt-[1.2cqi] max-w-[85%] text-[2.3cqi] uppercase tracking-[0.12em] text-zinc-500">
          Pack 1 passes left ↻
        </div>
      </div>

      {seats.map((seat, i) => {
        const angle = ((-90 + (i * 360) / n) * Math.PI) / 180;
        return (
          <div
            key={seat.playerId}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{
              left: `${50 + radius * Math.cos(angle)}%`,
              top: `${50 + radius * Math.sin(angle)}%`,
              width: `${avatarCqi * 1.35}cqi`,
            }}
          >
            <div
              className="relative"
              style={{ width: `${avatarCqi}cqi`, height: `${avatarCqi}cqi` }}
            >
              {seat.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={seat.avatarUrl}
                  alt=""
                  className="h-full w-full rounded-full object-cover ring-2 ring-amber-500/60"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-full bg-zinc-800 text-[4cqi] font-semibold text-zinc-400 ring-2 ring-zinc-700">
                  {seat.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span
                className="absolute -left-[4%] -top-[4%] grid place-items-center rounded-full bg-amber-400 font-bold tabular-nums text-zinc-950 shadow-lg ring-2 ring-zinc-950"
                style={{
                  width: `${avatarCqi * 0.4}cqi`,
                  height: `${avatarCqi * 0.4}cqi`,
                  fontSize: `${avatarCqi * 0.24}cqi`,
                }}
              >
                {i + 1}
              </span>
            </div>
            <div
              className="mt-[0.6cqi] max-w-full truncate text-center font-semibold text-zinc-100"
              style={{
                fontSize: `${Math.max(avatarCqi * 0.17, 2.6)}cqi`,
                textShadow: "0 2px 8px rgba(0,0,0,0.9)",
              }}
            >
              {seat.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

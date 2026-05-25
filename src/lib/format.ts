const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatDate(value: Date | string | number) {
  return dateFormatter.format(new Date(value));
}

export function formatPct(value: number) {
  return percentFormatter.format(value * 100);
}

export function formatRecord({
  wins,
  losses,
  draws,
}: {
  wins: number;
  losses: number;
  draws: number;
}) {
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}

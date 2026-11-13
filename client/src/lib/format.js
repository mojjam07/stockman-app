const naira = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-NG");

export const LOW_STOCK = 5; // at or below this many units an item is "running low"
export const fmtMoney = (n) => `₦${naira.format(Number(n) || 0)}`;
export const fmtInt = (n) => whole.format(Number(n) || 0);
export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
export const itemLabel = (i) => (i.size ? `${i.name} (${i.size})` : i.name);
export const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.size.localeCompare(b.size);

import { useMemo, useState } from "react";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import Receipt from "../components/Receipt.jsx";
import { fmtDateTime, fmtInt, fmtMoney, itemLabel } from "../lib/format";
import usePageTitle from "../lib/usePageTitle";
import { useData } from "../context/Data.jsx";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);
ChartJS.defaults.font.family = getComputedStyle(document.body).fontFamily;
ChartJS.defaults.color = "#586660";

const PERIODS = [["today", "Today"], ["7", "7 days"], ["30", "30 days"], ["all", "All time"]];
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const unitsIn = (s) => s.items.reduce((n, l) => n + l.quantity, 0);

function periodStart(period) {
  if (period === "all") return null;
  const start = startOfDay(new Date());
  if (period !== "today") start.setDate(start.getDate() - (Number(period) - 1));
  return start;
}

/** Buckets for the revenue chart: hours today, days for 7/30, months for all time (last 24). */
function buckets(period, sales) {
  const now = new Date();
  if (period === "today") {
    return { size: 24, caption: "Revenue by hour today", labels: Array.from({ length: 24 }, (_, h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`), key: (d) => d.getHours() };
  }
  if (period === "all") {
    const oldest = sales.length ? new Date(sales[sales.length - 1].createdAt) : now;
    const months = Math.min(Math.max((now.getFullYear() - oldest.getFullYear()) * 12 + now.getMonth() - oldest.getMonth() + 1, 1), 24);
    const first = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    return {
      size: months, caption: "Revenue by month",
      labels: Array.from({ length: months }, (_, i) => new Date(first.getFullYear(), first.getMonth() + i, 1).toLocaleDateString("en-NG", { month: "short", year: "2-digit" })),
      key: (d) => (d.getFullYear() - first.getFullYear()) * 12 + d.getMonth() - first.getMonth(),
    };
  }
  const days = Number(period);
  const first = startOfDay(now);
  first.setDate(first.getDate() - (days - 1));
  return {
    size: days, caption: `Revenue by day, last ${days} days`,
    labels: Array.from({ length: days }, (_, i) => {
      const d = new Date(first); d.setDate(first.getDate() + i);
      return d.toLocaleDateString("en-NG", days <= 7 ? { weekday: "short", day: "numeric" } : { day: "numeric", month: "short" });
    }),
    key: (d) => Math.round((startOfDay(d) - first) / 86400000),
  };
}

const GREEN = "#0F4A3A", GRID = "#E3E7E0";

export default function Reports() {
  usePageTitle("Reports");
  const { sales, status } = useData();
  const [period, setPeriod] = useState("7");
  const [query, setQuery] = useState("");
  const [receipt, setReceipt] = useState(null);

  const inPeriod = useMemo(() => {
    const start = periodStart(period);
    return start ? sales.filter((s) => new Date(s.createdAt) >= start) : sales;
  }, [sales, period]);

  const revenue = inPeriod.reduce((s, x) => s + x.total, 0);
  const unitsSold = inPeriod.reduce((s, x) => s + unitsIn(x), 0);

  const revenueChart = useMemo(() => {
    const b = buckets(period, sales);
    const data = new Array(b.size).fill(0);
    for (const s of inPeriod) {
      const i = b.key(new Date(s.createdAt));
      if (i >= 0 && i < b.size) data[i] += s.total;
    }
    return { caption: b.caption, labels: b.labels, data };
  }, [period, sales, inPeriod]);

  const top = useMemo(() => {
    const units = new Map();
    for (const s of inPeriod) for (const l of s.items) units.set(itemLabel(l), (units.get(itemLabel(l)) || 0) + l.quantity);
    return [...units].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [inPeriod]);

  const q = query.trim().toLowerCase();
  const rows = inPeriod.filter((s) => !q || `${s.receiptNumber} ${s.customerName}`.toLowerCase().includes(q));
  const loading = status === "loading" && !sales.length;

  return (
    <section>
      <div className="view-head">
        <h1 tabIndex={-1}>Reports</h1>
        <fieldset className="segmented">
          <legend className="sr-only">Period</legend>
          {PERIODS.map(([value, label]) => (
            <label key={value}><input type="radio" name="period" value={value} checked={period === value} onChange={() => setPeriod(value)} /><span>{label}</span></label>
          ))}
        </fieldset>
      </div>

      <dl className="stats" aria-label="Sales summary">
        <div><dt>Revenue</dt><dd>{fmtMoney(revenue)}</dd></div>
        <div><dt>Sales</dt><dd>{fmtInt(inPeriod.length)}</dd></div>
        <div><dt>Units sold</dt><dd>{fmtInt(unitsSold)}</dd></div>
        <div><dt>Average sale</dt><dd>{fmtMoney(inPeriod.length ? revenue / inPeriod.length : 0)}</dd></div>
      </dl>

      <div className="charts">
        <figure className="chart">
          <figcaption>{revenueChart.caption}</figcaption>
          <div className="chart-box">
            {inPeriod.length ? (
              <Bar
                aria-label={`${revenueChart.caption}. Total ${fmtMoney(revenue)}.`}
                role="img"
                data={{ labels: revenueChart.labels, datasets: [{ label: "Revenue", data: revenueChart.data, backgroundColor: GREEN, borderRadius: 4, maxBarThickness: 36 }] }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtMoney(c.parsed.y) } } },
                  scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true, grid: { color: GRID }, ticks: { callback: (v) => `₦${Intl.NumberFormat("en", { notation: "compact" }).format(v)}` } } },
                }}
              />
            ) : <p className="chart-empty">No sales in this period yet.</p>}
          </div>
        </figure>
        <figure className="chart">
          <figcaption>Best sellers (units)</figcaption>
          <div className="chart-box">
            {top.length ? (
              <Bar
                role="img"
                aria-label={`Best sellers: ${top.map(([n, c]) => `${n} ${c}`).join(", ")}`}
                data={{ labels: top.map(([n]) => (n.length > 22 ? `${n.slice(0, 21)}…` : n)), datasets: [{ label: "Units sold", data: top.map(([, c]) => c), backgroundColor: "#F4C531", borderColor: "#B8921A", borderWidth: 1, borderRadius: 4 }] }}
                options={{ indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: GRID }, ticks: { precision: 0 } }, y: { grid: { display: false } } } }}
              />
            ) : <p className="chart-empty">Best sellers appear after your first sale.</p>}
          </div>
        </figure>
      </div>

      <div className="view-head view-head-sub">
        <h2>Sales</h2>
        <div className="field field-search">
          <label className="sr-only" htmlFor="sales-search">Search sales</label>
          <input id="sales-search" type="search" placeholder="Search receipt or customer" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="empty"><strong>Loading sales…</strong></div>
      ) : rows.length ? (
        <table className="table table-sales">
          <thead><tr><th scope="col">Receipt</th><th scope="col">Date</th><th scope="col">Customer</th><th scope="col" className="num">Items</th><th scope="col" className="num">Total</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="c-receipt cell-name">#{s.receiptNumber}</td>
                <td className="c-date">{fmtDateTime(s.createdAt)}</td>
                <td className="c-customer">{s.customerName || "Walk-in customer"}</td>
                <td className="num c-items">{fmtInt(unitsIn(s))}</td>
                <td className="num c-total cell-name">{fmtMoney(s.total)}</td>
                <td className="cell-actions c-actions"><button className="btn-link" type="button" aria-label={`View receipt ${s.receiptNumber}`} onClick={() => setReceipt(s)}>Receipt</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          {sales.length && !q ? <><strong>No sales in this period</strong>Pick a longer period to see earlier sales.</>
            : q ? <><strong>No matches</strong>No sale matches “{query}”.</>
            : <><strong>No sales yet</strong>Completed sales and their receipts show up here.</>}
        </div>
      )}
      <Receipt sale={receipt} onClose={() => setReceipt(null)} />
    </section>
  );
}

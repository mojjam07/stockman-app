import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Receipt from "../components/Receipt.jsx";
import Thumb from "../components/Thumb.jsx";
import { api } from "../lib/api";
import { LOW_STOCK, fmtInt, fmtMoney, itemLabel } from "../lib/format";
import usePageTitle from "../lib/usePageTitle";
import { useAuth } from "../context/Auth.jsx";
import { useData } from "../context/Data.jsx";
import { useToast } from "../context/Toast.jsx";

export default function Sell() {
  usePageTitle("Sell");
  const { shopName } = useAuth();
  const { items, status, addSale, reloadItems } = useData();
  const toast = useToast();
  const roll = useRef(null);
  const [cart, setCart] = useState({}); // item id -> quantity
  const [customer, setCustomer] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Drop or trim lines if stock changed underneath us (item deleted or edited to fewer units).
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: byId.get(id), qty }))
    .filter((l) => l.item && l.item.quantity > 0)
    .map((l) => ({ ...l, qty: Math.min(l.qty, l.item.quantity) }));
  const total = lines.reduce((s, l) => s + l.item.price * l.qty, 0);
  const units = lines.reduce((s, l) => s + l.qty, 0);

  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => !q || `${i.name} ${i.size}`.toLowerCase().includes(q));

  function add(item) {
    const have = cart[item.id] || 0;
    if (have >= item.quantity) return toast(`Only ${item.quantity} of ${itemLabel(item)} in stock.`, "error");
    setCart((c) => ({ ...c, [item.id]: have + 1 }));
  }
  function setQty(id, qty) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id]; else next[id] = qty;
      return next;
    });
  }
  const reviewSale = () => roll.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  async function complete() {
    if (!lines.length) return;
    setBusy(true);
    try {
      const { data } = await api.post("/sales", { customerName: customer.trim(), items: lines.map((l) => ({ itemId: l.item.id, quantity: l.qty })) });
      setCart({});
      setCustomer("");
      addSale(data);
      await reloadItems().catch(() => {});
      setReceipt(data);
    } catch (err) {
      toast(err.message, "error");
      await reloadItems().catch(() => {}); // stock may have changed; show the truth
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="view-head"><h1 tabIndex={-1}>Sell</h1></div>
      <div className="sell">
        <div className="picker">
          <div className="field field-search">
            <label className="sr-only" htmlFor="pick-search">Find an item to sell</label>
            <input id="pick-search" type="search" placeholder="Find an item" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {status === "loading" && !items.length ? (
            <div className="empty"><strong>Loading your items…</strong></div>
          ) : shown.length ? (
            <ul className="pick-list">
              {shown.map((i) => {
                const inCart = cart[i.id] || 0;
                const left = i.quantity - inCart;
                return (
                  <li key={i.id}>
                    <button className={`pick${inCart ? " in-cart" : ""}`} type="button" disabled={i.quantity === 0} onClick={() => add(i)}>
                      <Thumb item={i} />
                      <span className="pick-body">
                        <span className="pick-name">{i.name}</span>{i.size && <span className="pick-meta"> {i.size}</span>}
                        <span className={`pick-stock${i.quantity <= LOW_STOCK ? " is-low" : ""}`}>
                          {i.quantity === 0 ? "Sold out" : `${fmtInt(left)} left`}{inCart > 0 && ` · ${inCart} in this sale`}
                        </span>
                      </span>
                      <span className="pick-price">{fmtMoney(i.price)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty">
              {!items.length ? <><strong>Nothing to sell yet</strong>Add your items in Inventory first.<br /><Link className="btn btn-primary" to="/inventory">Go to Inventory</Link></> : <><strong>No matches</strong>Nothing matches “{query}”.</>}
            </div>
          )}
        </div>

        <aside className="roll" id="roll" ref={roll} aria-label="Current sale">
          <header className="roll-head"><strong>{shopName}</strong><span>New sale</span></header>
          {lines.length > 0 ? (
            <ul className="roll-lines">
              {lines.map(({ item, qty }) => (
                <li className="roll-line" key={item.id}>
                  <Thumb item={item} size="sm" />
                  <span className="roll-line-name">{itemLabel(item)}</span>
                  <span className="roll-line-total">{fmtMoney(item.price * qty)}</span>
                  <span className="roll-line-ctrl">
                    <span className="step">
                      <button type="button" aria-label={`One less ${itemLabel(item)}`} onClick={() => setQty(item.id, qty - 1)}>−</button>
                      <output aria-label="Quantity">{qty}</output>
                      <button type="button" aria-label={`One more ${itemLabel(item)}`} disabled={qty >= item.quantity} onClick={() => add(item)}>+</button>
                    </span>
                    <span className="nowrap">× {fmtMoney(item.price)}</span>
                    <button className="btn-link is-danger roll-remove" type="button" aria-label={`Remove ${itemLabel(item)}`} title="Remove" onClick={() => setQty(item.id, 0)}>✕</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="roll-empty">Tap an item to add it to this sale.</p>
          )}
          <div className="roll-foot">
            <div className="field">
              <label htmlFor="customer-name">Customer (optional)</label>
              <input id="customer-name" type="text" maxLength={100} autoComplete="off" placeholder="Walk-in customer" value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </div>
            <div className="roll-total"><span>Total</span><output>{fmtMoney(total)}</output></div>
            <button className="btn btn-tag btn-block btn-large" type="button" disabled={!lines.length || busy} onClick={complete}>{busy ? "Completing…" : "Complete sale"}</button>
            {lines.length > 0 && <button className="btn btn-quiet btn-block" type="button" onClick={() => setCart({})}>Clear sale</button>}
          </div>
        </aside>
      </div>

      {lines.length > 0 && (
        <button className="cartbar" type="button" onClick={reviewSale}>
          <span>{units} item{units === 1 ? "" : "s"}</span>
          <span className="cartbar-total">{fmtMoney(total)}</span>
          <span className="cartbar-go">Review sale</span>
        </button>
      )}
      <Receipt sale={receipt} onClose={() => setReceipt(null)} />
    </section>
  );
}

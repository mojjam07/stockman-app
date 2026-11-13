import { useMemo, useState } from "react";
import ItemDialog from "./ItemDialog.jsx";
import Thumb from "../components/Thumb.jsx";
import { api } from "../lib/api";
import { LOW_STOCK, fmtInt, fmtMoney, itemLabel } from "../lib/format";
import usePageTitle from "../lib/usePageTitle";
import { useData } from "../context/Data.jsx";
import { useToast } from "../context/Toast.jsx";
import { useConfirm } from "../context/Confirm.jsx";

const Stat = ({ label, value, alert }) => (
  <div><dt>{label}</dt><dd className={alert ? "is-alert" : undefined}>{value}</dd></div>
);

export default function Inventory() {
  usePageTitle("Inventory");
  const { items, status, dropItem } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [dialog, setDialog] = useState({ open: false, item: null });

  const low = items.filter((i) => i.quantity <= LOW_STOCK).length;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => items.filter((i) => (!lowOnly || i.quantity <= LOW_STOCK) && (!q || `${i.name} ${i.size}`.toLowerCase().includes(q))),
    [items, lowOnly, q]
  );
  const openAdd = () => setDialog({ open: true, item: null });
  const close = () => setDialog((d) => ({ ...d, open: false }));

  async function remove(item) {
    const ok = await confirm({
      title: `Delete ${itemLabel(item)}?`,
      body: "It will be removed from your inventory. Past sales that included it stay in your reports.",
    });
    if (!ok) return;
    try {
      await api.del(`/items/${item.id}`);
      dropItem(item.id);
      toast(`Deleted ${itemLabel(item)}.`);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  return (
    <section>
      <div className="view-head">
        <h1 tabIndex={-1}>Inventory</h1>
        <button className="btn btn-primary" type="button" onClick={openAdd}>Add item</button>
      </div>

      <dl className="stats" aria-label="Stock summary">
        <Stat label="Products" value={fmtInt(items.length)} />
        <Stat label="Units in stock" value={fmtInt(items.reduce((s, i) => s + i.quantity, 0))} />
        <Stat label="Stock value" value={fmtMoney(items.reduce((s, i) => s + i.price * i.quantity, 0))} />
        <Stat label="Running low" value={fmtInt(low)} alert={low > 0} />
      </dl>

      <div className="toolbar">
        <div className="field field-search">
          <label className="sr-only" htmlFor="inv-search">Search items</label>
          <input id="inv-search" type="search" placeholder="Search by name or size" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className="check"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Running low only</label>
      </div>

      {status === "loading" && !items.length ? (
        <div className="empty"><strong>Loading your inventory…</strong></div>
      ) : shown.length ? (
        <table className="table table-inventory">
          <thead>
            <tr><th scope="col" className="c-thumb"><span className="sr-only">Photo</span></th><th scope="col">Item</th><th scope="col" className="num">Price</th><th scope="col" className="num">In stock</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id}>
                <td className="c-thumb"><Thumb item={i} /></td>
                <td className="cell-main c-name"><span className="cell-name">{i.name}</span>{i.size && <span className="cell-sub">{i.size}</span>}</td>
                <td className="num c-price">{fmtMoney(i.price)}</td>
                <td className="num c-stock">
                  {fmtInt(i.quantity)}
                  {i.quantity === 0 ? <span className="chip chip-out">Out of stock</span> : i.quantity <= LOW_STOCK ? <span className="chip chip-low">Low</span> : null}
                </td>
                <td className="cell-actions c-actions">
                  <button className="btn-link" type="button" aria-label={`Edit ${itemLabel(i)}`} onClick={() => setDialog({ open: true, item: i })}>Edit</button>
                  <button className="btn-link is-danger" type="button" aria-label={`Delete ${itemLabel(i)}`} onClick={() => remove(i)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          {!items.length ? (
            <>
              <strong>No items yet</strong>Add what you sell, with a photo and a price, and you can start selling right away.<br />
              <button className="btn btn-primary" type="button" onClick={openAdd}>Add your first item</button>
            </>
          ) : lowOnly && !q ? (
            <><strong>Nothing is running low</strong>Every item has more than {LOW_STOCK} in stock.</>
          ) : (
            <><strong>No matches</strong>Nothing in your inventory matches “{query}”.</>
          )}
        </div>
      )}

      <ItemDialog open={dialog.open} item={dialog.item} onClose={close} />
    </section>
  );
}

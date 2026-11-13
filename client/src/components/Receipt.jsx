import { createPortal } from "react-dom";
import Dialog from "./Dialog.jsx";
import { useAuth } from "../context/Auth.jsx";
import { fmtDateTime, fmtMoney } from "../lib/format";

function Sheet({ sale, shopName, telephone }) {
  return (
    <div className="receipt-sheet">
      <div className="r-center">
        <div className="r-biz">{shopName}</div>
        {telephone && <div>{telephone}</div>}
      </div>
      <hr className="r-rule" />
      <div>Receipt #{sale.receiptNumber}</div>
      <div>{fmtDateTime(sale.createdAt)}</div>
      <div>Customer: {sale.customerName || "Walk-in customer"}</div>
      <hr className="r-rule" />
      {sale.items.map((l) => (
        <div className="r-line" key={l.id}>
          <div>{l.name}{l.size ? ` (${l.size})` : ""}</div>
          <div className="r-line-row"><span>{l.quantity} × {fmtMoney(l.unitPrice)}</span><span>{fmtMoney(l.lineTotal)}</span></div>
        </div>
      ))}
      <hr className="r-rule" />
      <div className="r-total"><span>Total</span><span>{fmtMoney(sale.total)}</span></div>
      <p className="r-thanks">Thank you for your patronage.</p>
    </div>
  );
}

/** Shown on screen in a dialog; a second copy is rendered into #print-root so printing shows only the receipt. */
export default function Receipt({ sale, onClose }) {
  const { shopName, telephone } = useAuth();
  return (
    <>
      <Dialog open={!!sale} onClose={onClose} label="Receipt" className="receipt-dialog">
        {sale && <Sheet sale={sale} shopName={shopName} telephone={telephone} />}
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>Close</button>
          <button className="btn btn-primary" type="button" data-autofocus onClick={() => window.print()}>Print receipt</button>
        </div>
      </Dialog>
      {sale && createPortal(<Sheet sale={sale} shopName={shopName} telephone={telephone} />, document.getElementById("print-root"))}
    </>
  );
}

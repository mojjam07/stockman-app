import { useState } from "react";
import Dialog from "./Dialog.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useToast } from "../context/Toast.jsx";

function Form({ onClose }) {
  const { profile, updateProfile, session } = useAuth();
  const toast = useToast();
  const [businessName, setBusinessName] = useState(profile?.businessName ?? "");
  const [telephone, setTelephone] = useState(profile?.telephone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await updateProfile({ businessName, telephone });
      toast("Shop details saved.");
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Shop details</h2>
      <p className="hint dialog-lead">These are printed on your receipts. Signed in as {session?.user?.email}.</p>
      <div className="field"><label htmlFor="shop-name">Shop name</label><input id="shop-name" value={businessName} maxLength={120} onChange={(e) => setBusinessName(e.target.value)} data-autofocus /></div>
      <div className="field"><label htmlFor="shop-phone">Phone number</label><input id="shop-phone" value={telephone} maxLength={20} inputMode="tel" autoComplete="tel" onChange={(e) => setTelephone(e.target.value)} /></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

export default function ShopDialog({ open, onClose }) {
  return <Dialog open={open} onClose={onClose} label="Shop details"><Form onClose={onClose} /></Dialog>;
}

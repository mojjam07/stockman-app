import { useEffect, useRef, useState } from "react";
import Dialog from "../components/Dialog.jsx";
import Thumb from "../components/Thumb.jsx";
import { api, ApiError } from "../lib/api";
import { compressImage } from "../lib/image";
import { itemLabel } from "../lib/format";
import { useData } from "../context/Data.jsx";
import { useToast } from "../context/Toast.jsx";

function check(v) {
  const e = {};
  if (!v.name.trim()) e.name = "Enter the item’s name.";
  if (v.price === "" || !(Number(v.price) > 0)) e.price = "Enter a price greater than zero.";
  if (v.quantity === "" || !Number.isInteger(Number(v.quantity)) || Number(v.quantity) < 0) e.quantity = "Enter a whole number, 0 or more.";
  return e;
}

function Form({ item, onClose }) {
  const { putItem } = useData();
  const toast = useToast();
  const fileInput = useRef(null);
  const nameInput = useRef(null);
  const empty = { name: "", size: "", price: "", quantity: "" };
  const [values, setValues] = useState(item ? { name: item.name, size: item.size, price: String(item.price), quantity: String(item.quantity) } : empty);
  const [photo, setPhoto] = useState(null); // compressed Blob chosen in this dialog
  const [preview, setPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepping, setPrepping] = useState(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x)); // an error disappears as soon as you start fixing it
  };

  async function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setPrepping(true);
    try {
      const blob = await compressImage(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
      setRemovePhoto(false);
      setErrors((x) => ({ ...x, image: undefined }));
    } catch (err) {
      setErrors((x) => ({ ...x, image: err.message }));
    } finally {
      setPrepping(false);
    }
  }
  const clearPhoto = () => { setPhoto(null); setPreview(null); setRemovePhoto(true); };

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const found = check(values);
    setErrors(found);
    if (Object.keys(found).length) { document.getElementById(`f-${Object.keys(found)[0]}`)?.focus(); return; }

    const fd = new FormData();
    fd.set("name", values.name.trim());
    fd.set("size", values.size.trim());
    fd.set("price", values.price);
    fd.set("quantity", values.quantity);
    if (photo) fd.set("image", photo, photo.type === "image/webp" ? "photo.webp" : "photo.jpg");
    else if (item && removePhoto) fd.set("removeImage", "true");

    setBusy(true);
    try {
      if (item) {
        const { data } = await api.patch(`/items/${item.id}`, fd);
        putItem(data.item);
        toast(`Saved changes to ${itemLabel(data.item)}.`);
        onClose();
      } else {
        const { data } = await api.post("/items", fd);
        putItem(data.item);
        toast(data.merged ? `Added ${values.quantity} to ${itemLabel(data.item)}. Now ${data.item.quantity} in stock.` : `Added ${itemLabel(data.item)}.`);
        // Stay open for the next item: restocking is usually done in a run.
        setValues(empty); setPhoto(null); setPreview(null); setErrors({});
        nameInput.current?.focus();
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const shownUrl = preview ?? (removePhoto ? null : item?.imageUrl ?? null);
  const thumbItem = { name: values.name || item?.name || "?", imageUrl: shownUrl };
  const hasPhoto = !!shownUrl;
  const fieldProps = (k) => ({ id: `f-${k}`, value: values[k], onChange: set(k), "aria-invalid": errors[k] ? "true" : undefined });

  return (
    <form onSubmit={submit} noValidate>
      <h2>{item ? "Edit item" : "Add item"}</h2>

      <div className="photo-field">
        <Thumb item={thumbItem} size="lg" />
        <div className="photo-actions">
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={choose} />
          <button className="btn btn-small" type="button" onClick={() => fileInput.current.click()} disabled={prepping}>
            {prepping ? "Preparing…" : hasPhoto ? "Change photo" : "Add photo"}
          </button>
          {hasPhoto && <button className="btn-link is-danger" type="button" onClick={clearPhoto}>Remove photo</button>}
          {errors.image ? <p className="error" role="alert">{errors.image}</p> : <p className="hint">Take a photo or pick one from your gallery.</p>}
        </div>
      </div>

      <div className="field"><label htmlFor="f-name">Item name</label><input {...fieldProps("name")} ref={nameInput} type="text" maxLength={100} autoComplete="off" data-autofocus />{errors.name && <p className="error">{errors.name}</p>}</div>
      <div className="field"><label htmlFor="f-size">Size or type (optional)</label><input {...fieldProps("size")} type="text" maxLength={50} autoComplete="off" placeholder="e.g. 50kg, XL, 1 litre" />{errors.size && <p className="error">{errors.size}</p>}</div>
      <div className="field-row">
        <div className="field"><label htmlFor="f-price">Price (₦)</label><input {...fieldProps("price")} type="number" inputMode="decimal" min="0.01" step="0.01" />{errors.price && <p className="error">{errors.price}</p>}</div>
        <div className="field"><label htmlFor="f-quantity">Quantity in stock</label><input {...fieldProps("quantity")} type="number" inputMode="numeric" min="0" step="1" />{errors.quantity && <p className="error">{errors.quantity}</p>}</div>
      </div>
      {!item && <p className="hint">Adding an item you already have adds to its stock and updates its price.</p>}
      {formError && <p className="error" role="alert">{formError}</p>}
      <div className="dialog-actions">
        <button className="btn" type="button" onClick={onClose}>{item ? "Cancel" : "Done"}</button>
        <button className="btn btn-primary" type="submit" disabled={busy || prepping}>{busy ? "Saving…" : item ? "Save changes" : "Add item"}</button>
      </div>
    </form>
  );
}

export default function ItemDialog({ open, item, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} label={item ? "Edit item" : "Add item"}>
      <Form item={item} onClose={onClose} />
    </Dialog>
  );
}

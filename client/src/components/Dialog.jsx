import { useEffect, useRef } from "react";

/** Native <dialog>: focus trapping, Esc to close and the backdrop come from the browser.
 *  Children only mount while open, so each opening starts with fresh form state. */
export default function Dialog({ open, onClose, label, className, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector("[data-autofocus]")?.focus(); // React's autoFocus runs while the dialog is still closed
    }
    else if (!open && d.open) d.close();
  }, [open]);

  const onClick = (e) => {
    if (e.target !== e.currentTarget) return; // only clicks on the dialog itself (padding/backdrop)
    const r = ref.current.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) ref.current.close();
  };

  return (
    <dialog ref={ref} className={className} aria-label={label} onClose={() => onClose?.()} onClick={onClick}>
      {open ? children : null}
    </dialog>
  );
}

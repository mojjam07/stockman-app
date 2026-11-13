import { createContext, useCallback, useContext, useRef, useState } from "react";
import Dialog from "../components/Dialog.jsx";

const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);

/** `const ok = await confirm({ title, body, confirmLabel })` */
export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setAsk(options);
      }),
    []
  );
  const finish = (answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setAsk(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog open={!!ask} onClose={() => finish(false)} label={ask?.title}>
        <h2>{ask?.title}</h2>
        <p className="confirm-body">{ask?.body}</p>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={() => finish(false)}>Cancel</button>
          <button className="btn btn-danger" type="button" onClick={() => finish(true)}>{ask?.confirmLabel || "Delete"}</button>
        </div>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

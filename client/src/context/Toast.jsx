import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, kind = "info") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-1), { id, message, kind }]); // at most two on screen
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss]
  );
  const value = useMemo(() => toast, [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === "error" ? " toast-error" : ""}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

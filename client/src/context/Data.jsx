import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { byName } from "../lib/format";
import { useAuth } from "./Auth.jsx";

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

export function DataProvider({ children }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [i, s] = await Promise.all([api.get("/items"), api.get("/sales")]);
      setItems(i.data.sort(byName));
      setSales(s.data);
      setStatus("ready");
      setError("");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (userId) load();
    else { setItems([]); setSales([]); setStatus("loading"); }
  }, [userId, load]);

  const reloadItems = useCallback(async () => {
    const { data } = await api.get("/items");
    setItems(data.sort(byName));
  }, []);

  const putItem = useCallback((item) => setItems((prev) => [...prev.filter((x) => x.id !== item.id), item].sort(byName)), []);
  const dropItem = useCallback((id) => setItems((prev) => prev.filter((x) => x.id !== id)), []);
  const addSale = useCallback((sale) => setSales((prev) => [sale, ...prev]), []);

  const value = useMemo(
    () => ({ items, sales, status, error, load, reloadItems, putItem, dropItem, addSale }),
    [items, sales, status, error, load, reloadItems, putItem, dropItem, addSale]
  );
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

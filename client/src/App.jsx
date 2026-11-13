import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { configured } from "./lib/supabase";
import { AuthProvider, useAuth } from "./context/Auth.jsx";
import { DataProvider } from "./context/Data.jsx";
import { ToastProvider } from "./context/Toast.jsx";
import { ConfirmProvider } from "./context/Confirm.jsx";
import Shell from "./components/Shell.jsx";
import { Login, Signup } from "./pages/AuthPages.jsx";
import Inventory from "./pages/Inventory.jsx";
import Sell from "./pages/Sell.jsx";

const Reports = lazy(() => import("./pages/Reports.jsx")); // keeps Chart.js out of the first download

function ConfigError() {
  return (
    <main className="config-error">
      <h1>Almost there</h1>
      <p>StockMan can’t find its Supabase settings. Add these two lines to the <code>.env</code> file in the project folder, then restart:</p>
      <pre><code>{"VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key"}</code></pre>
      <p className="hint">The README explains where to find them in the Supabase dashboard.</p>
    </main>
  );
}

function RequireAuth({ children }) {
  const { session } = useAuth();
  const location = useLocation();
  if (session === undefined) return <div className="splash">Loading…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  if (!configured) return <ConfigError />;
  return (
    <ToastProvider>
      <AuthProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              element={
                <RequireAuth>
                  <DataProvider>
                    <Shell />
                  </DataProvider>
                </RequireAuth>
              }
            >
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/sell" element={<Sell />} />
              <Route path="/reports" element={<Suspense fallback={<div className="empty"><strong>Loading reports…</strong></div>}><Reports /></Suspense>} />
            </Route>
            <Route path="*" element={<Navigate to="/inventory" replace />} />
          </Routes>
        </ConfirmProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

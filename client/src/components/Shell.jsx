import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import Brand from "./Brand.jsx";
import ShopDialog from "./ShopDialog.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useData } from "../context/Data.jsx";

const TABS = [
  ["/inventory", "Inventory", "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z M3 7.5l9 4.5 9-4.5 M12 12v9"],
  ["/sell", "Sell", "M6 3h12v18l-3-2-3 2-3-2-3 2V3Z M9 8h6 M9 12h6"],
  ["/reports", "Reports", "M4 20V10 M10 20V4 M16 20v-7 M22 20H2"],
];

export default function Shell() {
  const { shopName, signOut } = useAuth();
  const { status, error, load } = useData();
  const [shopOpen, setShopOpen] = useState(false);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <Link className="brand" to="/inventory"><Brand /></Link>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>
        <div className="who">
          <button className="who-name" type="button" onClick={() => setShopOpen(true)} title="Edit shop details">{shopName}</button>
          <button className="btn btn-ghost" type="button" onClick={signOut}>Log out</button>
        </div>
      </header>

      <main id="main" className="page">
        {status === "error" && (
          <div className="notice notice-error" role="alert">
            <span>{error}</span>
            <button className="btn btn-small" type="button" onClick={load}>Try again</button>
          </div>
        )}
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([to, label, path]) => (
          <NavLink key={to} to={to}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
            {label}
          </NavLink>
        ))}
      </nav>
      <ShopDialog open={shopOpen} onClose={() => setShopOpen(false)} />
    </>
  );
}

import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/Auth.jsx";
import Brand from "../components/Brand.jsx";

function Frame({ title, children, footer }) {
  return (
    <main className="auth">
      <aside className="auth-brand">
        <span className="brand"><Brand /></span>
        <p className="auth-pitch">Know what’s on the shelf and what you sold today.</p>
        <p className="auth-sub">Stock with photos, fast sales and printed receipts for your shop, on any phone or computer.</p>
      </aside>
      <section className="auth-form">
        <h1>{title}</h1>
        {children}
        <p className="auth-switch">{footer}</p>
      </section>
    </main>
  );
}

function friendly(message = "") {
  if (/invalid login credentials/i.test(message)) return "Wrong email or password. Check both and try again.";
  if (/already registered|already been registered/i.test(message)) return "That email already has an account. Try logging in.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/password/i.test(message)) return message;
  return message || "Something went wrong. Try again.";
}

export function Login() {
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to={location.state?.from || "/inventory"} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError(friendly(error.message)); setBusy(false); }
  }

  return (
    <Frame title="Log in" footer={<>New here? <Link to="/signup">Create your shop account</Link></>}>
      <form onSubmit={submit} noValidate>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
    </Frame>
  );
}

export function Signup() {
  const { session } = useAuth();
  const [form, setForm] = useState({ businessName: "", telephone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  if (session) return <Navigate to="/inventory" replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (form.password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { business_name: form.businessName.trim(), telephone: form.telephone.trim() } },
    });
    if (error) { setError(friendly(error.message)); setBusy(false); return; }
    if (!data.session) { setCheckEmail(true); setBusy(false); } // project requires email confirmation
  }

  if (checkEmail) {
    return (
      <Frame title="Check your email" footer={<><Link to="/login">Back to log in</Link></>}>
        <p>We sent a confirmation link to <strong>{form.email}</strong>. Open it, then log in.</p>
      </Frame>
    );
  }
  return (
    <Frame title="Create your shop account" footer={<>Already have an account? <Link to="/login">Log in</Link></>}>
      <form onSubmit={submit} noValidate>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div className="field"><label htmlFor="biz">Shop name</label><input id="biz" autoComplete="organization" maxLength={120} value={form.businessName} onChange={set("businessName")} autoFocus /><span className="hint">Printed at the top of your receipts.</span></div>
        <div className="field"><label htmlFor="tel">Phone number</label><input id="tel" type="tel" autoComplete="tel" maxLength={20} value={form.telephone} onChange={set("telephone")} /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required /><span className="hint">At least 8 characters.</span></div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </Frame>
  );
}

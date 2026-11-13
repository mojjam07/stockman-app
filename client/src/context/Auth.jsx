import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    let alive = true;
    api.get("/me").then(({ data }) => alive && setProfile(data)).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const updateProfile = useCallback(async (patch) => {
    const { data } = await api.patch("/me", patch);
    setProfile(data);
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      shopName: profile?.businessName || session?.user?.email || "Your shop",
      telephone: profile?.telephone || "",
      updateProfile,
      signOut: () => supabase.auth.signOut(),
    }),
    [session, profile, updateProfile]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

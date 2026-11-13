import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the .env values are missing, so the app can explain what to do instead of crashing. */
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

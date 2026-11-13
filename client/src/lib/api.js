import { supabase } from "./supabase";

export class ApiError extends Error {
  constructor(message, { status = 0, fields = {} } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(method, path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { Accept: "application/json" };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  let payload;
  if (body instanceof FormData) payload = body; // the browser sets the multipart boundary
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError("Can’t reach the server. Check your internet connection and try again.");
  }
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }

  if (res.ok) return { data, status: res.status };
  if (res.status === 401) {
    await supabase.auth.signOut(); // the router then sends the person to the login page
    throw new ApiError("Your session has ended. Please log in again.", { status: 401 });
  }
  throw new ApiError(data?.error || "That didn’t work. Try again.", { status: res.status, fields: data?.fields || {} });
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b) => request("POST", p, b ?? {}),
  patch: (p, b) => request("PATCH", p, b ?? {}),
  del: (p) => request("DELETE", p),
};

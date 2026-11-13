import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") }); // one .env at the project root serves server and client

export function loadConfig(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}. See .env.example and the README.`);
  }
  return {
    port: Number(env.PORT) || 4000,
    supabaseUrl: url.replace(/\/+$/, ""),
    serviceKey,
    clientDir: path.join(root, "client", "dist"),
  };
}

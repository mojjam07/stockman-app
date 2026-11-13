import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { createSupabaseBackend } from "./repo.supabase.js";

const config = loadConfig();
const { repo, verifyToken } = createSupabaseBackend({ url: config.supabaseUrl, serviceKey: config.serviceKey });
const clientDir = existsSync(config.clientDir) ? config.clientDir : null;
if (!clientDir) console.warn("client/dist not found: serving the API only (run `npm run build`, or use `npm run dev`).");

const app = createApp({ repo, verifyToken, clientDir, supabaseOrigin: config.supabaseUrl });
app.listen(config.port, () => console.log(`StockMan listening on http://localhost:${config.port}`));

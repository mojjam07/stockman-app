import serverless from "serverless-http";
import { loadConfig } from "../server/src/config.js";
import { createSupabaseBackend } from "../server/src/repo.supabase.js";
import { createApp } from "../server/src/app.js";

const config = loadConfig();
const { repo, verifyToken } = createSupabaseBackend({
  url: config.supabaseUrl,
  serviceKey: config.serviceKey,
});

const app = createApp({
  repo,
  verifyToken,
  clientDir: null,
  supabaseOrigin: config.supabaseUrl,
});

export default serverless(app);

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// One .env at the project root feeds both the server and (VITE_-prefixed values only) this client.
export default defineConfig({
  plugins: [react()],
  envDir: "..",
  server: { port: 5173, proxy: { "/api": "http://localhost:4000", "/healthz": "http://localhost:4000" } },
  build: { outDir: "dist", sourcemap: false },
});

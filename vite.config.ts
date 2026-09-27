import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all network interfaces (not just localhost) so the dev
    // server can be reached from a phone on the same network for mobile
    // responsiveness checks.
    host: true,
  },
});

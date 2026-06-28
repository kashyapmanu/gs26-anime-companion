import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendPort = process.env.BACKEND_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/session": `http://localhost:${backendPort}`,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${loadEnv(mode, process.cwd(), "JH_").JH_PORT || 3000}`,
    },
  },
  build: { outDir: "dist", sourcemap: false },
}));

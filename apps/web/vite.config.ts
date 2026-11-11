import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const apiDir = fileURLToPath(new URL("../api", import.meta.url));
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(({ mode }) => {
  // Reuse the API's .env so the dev proxy can inject the service key server-side.
  const apiEnv = loadEnv(mode, apiDir, "");
  const serviceKey = process.env.SERVICE_API_KEY ?? apiEnv.SERVICE_API_KEY ?? "";

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    resolve: {
      alias: {
        "@": srcDir,
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          headers: serviceKey === "" ? {} : { Authorization: `Bearer ${serviceKey}` },
        },
      },
    },
  };
});

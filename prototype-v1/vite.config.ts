import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": `http://127.0.0.1:${process.env.AIL_API_PORT || process.env.PORT || "3000"}` } },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the same artefact serves from a domain root (Cloudflare Pages) and
  // from a subpath (GitHub Pages project sites). Safe because there is no client-side
  // routing. The default absolute base 404'd every asset on the first real Pages deploy.
  base: "./",
  build: { outDir: "dist", sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as never);

import { defineConfig } from "vite";

export default defineConfig({
  base: "/F40-Three.js/", // для gh-pages
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
  assetsInclude: ["**/*.gltf", "**/*.mp3", "**/*.wav"],
});

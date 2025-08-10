import { defineConfig } from "vite";

export default defineConfig({
  base: "/F40-Three.js/", // для gh-pages
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  assetsInclude: ["**/*.gltf", "**/*.mp3", "**/*.wav"],
});

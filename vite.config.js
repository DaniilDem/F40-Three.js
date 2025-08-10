import { defineConfig } from "vite";
import { resolve } from "path";
import { copySync } from "fs-extra";

function copyStatic() {
  return {
    name: "copy-static",
    closeBundle() {
      // Копируем папки sfx и models в docs
      copySync(resolve("sfx"), resolve("docs/sfx"));
      copySync(resolve("models"), resolve("docs/models"));
    },
  };
}

export default defineConfig({
  base: "/F40-Three.js/", // для gh-pages
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
  assetsInclude: ["**/*.gltf", "**/*.mp3", "**/*.wav"],
  plugins: [copyStatic()],
});

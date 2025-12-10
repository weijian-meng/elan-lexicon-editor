import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    root: "ui",
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
}));

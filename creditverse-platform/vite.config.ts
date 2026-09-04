import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    /* One React, always. A lazily-imported library that resolves its own copy
       gives "Invalid hook call" at the moment the chunk loads — the editor is
       the first dependency here big enough to be code-split, which is why this
       had not bitten before. */
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    /* The editor is behind React.lazy, so Vite does not see it at startup and
       re-optimizes mid-session the first time a composer opens — which reloads
       the page under the user and briefly runs two React instances. Declaring
       it up front keeps the split (the production chunk is unaffected) without
       the mid-session surprise. */
    include: [
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-underline",
      "@tiptap/extension-link",
      "@tiptap/extension-task-list",
      "@tiptap/extension-task-item",
      "@tiptap/extension-placeholder",
    ],
  },
});

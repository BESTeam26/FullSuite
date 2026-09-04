import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
/* After index.css on purpose: these rules restore list markers and the
   checklist row layout that Tailwind's preflight strips, and must win over it.
   Scoped to .ProseMirror and .note-content — see the file header. */
import "./styles/rich-text.css";

createRoot(document.getElementById("root")!).render(<App />);

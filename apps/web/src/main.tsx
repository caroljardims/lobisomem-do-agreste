import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { AuthProvider } from "./context/AuthContext.js";
import { isLocalDebug } from "./debug/isLocalDebug.js";
import "./styles.css";

if (typeof window !== "undefined" && isLocalDebug()) {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("folhetim-debug-toggle"));
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);

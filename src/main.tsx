import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./liquid-glass.css";
import "./precipitation-timeline.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root missing");

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

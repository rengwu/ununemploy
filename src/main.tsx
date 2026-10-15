import React from "react";
import { createRoot } from "react-dom/client";
import "./ui.css";
import "./styles.css";
import { App } from "./App.tsx";
if (
  (window as Window & { __UNUNEMPLOY_DESKTOP__?: boolean })
    .__UNUNEMPLOY_DESKTOP__
)
  document.documentElement.dataset.native = "true";
const preference = localStorage.getItem("jh-theme");
document.documentElement.dataset.mode =
  preference === "light" || preference === "dark"
    ? preference
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

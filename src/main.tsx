import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles-polish.css";
import "./styles-legacy-ui.css";
import "./styles-legacy-bridge.css";
import "./styles-manga-home.css";
import "./styles-layout-routes.css";
import "./styles-experience.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

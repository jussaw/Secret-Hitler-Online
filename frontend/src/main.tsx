import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { sounds } from "./sound/SoundManager";

// Audio starts on the first click, tap or key press; the clips download meanwhile.
sounds.listenForGesture(document);
void sounds.preload();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { sounds } from "./sound/SoundManager";
import { isStatsPath } from "./statsPath";

// The stats pages are a chunk of their own, fetched only on a stats path, so the game's first
// download holds none of them.
const StatsApp = React.lazy(() => import("./stats/StatsApp"));

const root = createRoot(document.getElementById("root")!);

if (isStatsPath(window.location.pathname)) {
  // The stats play no sound: no gesture listener, no clips.
  root.render(
    <React.StrictMode>
      <Suspense fallback={null}>
        <StatsApp />
      </Suspense>
    </React.StrictMode>
  );
} else {
  // Audio starts on the first click, tap or key press; the clips download meanwhile.
  sounds.listenForGesture(document);
  void sounds.preload();

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

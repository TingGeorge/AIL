import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);

// 只在 production 註冊：bun run dev 走 Vite，不能被舊快取污染。
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

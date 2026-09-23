import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import App from "./app";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

// 本地错误兜底（替代平台 AppContainer 内置的 ErrorRender，去除平台水印依赖）
function LocalErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FFF9F3] px-6 text-center">
      <div className="text-4xl">🤯</div>
      <p className="text-sm font-medium text-[#4A3F35]">页面开了个小差</p>
      <p className="max-w-xs break-all text-xs text-[#8B7B6D]">{error?.message}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="mt-2 rounded-full bg-[#9DC9A5] px-5 py-2 text-sm font-medium text-white transition-all active:scale-95"
      >
        重新试试
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={process.env.CLIENT_BASE_PATH || "/"}>
      <ErrorBoundary fallbackRender={LocalErrorFallback}>
        <App />
      </ErrorBoundary>
      <Toaster richColors position="top-center" />
    </BrowserRouter>
  </StrictMode>,
);

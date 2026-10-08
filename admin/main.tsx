import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Toaster } from "sonner";
import { router } from "./router";
import "./styles/app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: true, retry: (count, error) => count < 2 && !(error instanceof Error && "status" in error && (error as { status: number }).status < 500) },
  },
});

const container = document.getElementById("admin-root");
if (!container) throw new Error("#admin-root introuvable");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" toastOptions={{ className: "!rounded-xl !border-line !bg-surface !text-ink !text-xs" }} />
    </QueryClientProvider>
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NuqsAdapter } from "nuqs/adapters/react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "@afisa/backend/api";
import "@afisa/ui/styles.css";
import "./hq.css";
import { App } from "./App";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error("VITE_CONVEX_URL haijawekwa. Nakili apps/hq/.env.example kuwa .env.local.");
const convex = new ConvexReactClient(url);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider
      client={convex}
      storageNamespace="afisa-hq"
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
        isAuthenticated: api.auth.isAuthenticated,
      }}
    >
      <NuqsAdapter>
        <App />
      </NuqsAdapter>
    </ConvexAuthProvider>
  </StrictMode>,
);

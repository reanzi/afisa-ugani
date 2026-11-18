import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "@afisa/backend/api";
import "@afisa/ui/styles.css";
import "./field.css";
import { convex } from "./lib/client";
import { requestPersistentStorage } from "./lib/db";
import { App } from "./App";

void requestPersistentStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider
      client={convex}
      storageNamespace="afisa-field"
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
        isAuthenticated: api.auth.isAuthenticated,
      }}
    >
      <BrowserRouter>
        <NuqsAdapter>
          <App />
        </NuqsAdapter>
      </BrowserRouter>
    </ConvexAuthProvider>
  </StrictMode>,
);

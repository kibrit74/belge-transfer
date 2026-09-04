import { lazy, Suspense } from "react";
import { AuthProvider } from "./auth/AuthContext.jsx";
import SecureLinkReceivePage from "./pages/SecureLinkReceivePage.jsx";
import { resolveRoute } from "./routes.js";

const App = lazy(() => import("./App.jsx"));

export function AppEntry({ AuthBoundary = AuthProvider }) {
  if (resolveRoute(window.location.pathname) === "secure-link-receive") {
    return <SecureLinkReceivePage />;
  }

  return (
    <AuthBoundary>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </AuthBoundary>
  );
}

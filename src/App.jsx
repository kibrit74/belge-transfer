import FaqPage from "./pages/FaqPage";
import LandingPage from "./pages/LandingPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProtectedTransferRoute from "./components/ProtectedTransferRoute.jsx";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import PricingPage from "./pages/PricingPage.jsx";
import SecureLinkReceivePage from "./pages/SecureLinkReceivePage.jsx";
import { resolveRoute } from "./routes";
import AdminRoute from "./admin/AdminRoute.jsx";

export default function App() {
  const route = resolveRoute(window.location.pathname);
  if (route === "landing") return <LandingPage />;
  if (route === "transfer") return <ProtectedTransferRoute />;
  if (route === "faq") return <FaqPage />;
  if (route === "login") return <LoginPage />;
  if (route === "profile") return <ProfilePage />;
  if (route === "pricing") return <PricingPage />;
  if (route === "secure-link-receive") return <SecureLinkReceivePage />;
  if (route === "admin") return <AdminRoute />;
  return <NotFoundPage />;
}

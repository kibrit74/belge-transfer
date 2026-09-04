import { useAuth } from "../auth/AuthContext.jsx";
import TransferPage from "../pages/TransferPage.jsx";
import SiteNavbar from "./SiteNavbar.jsx";

function SessionLoading() {
  return (
    <div className="member-page">
      <SiteNavbar />
      <main className="member-card access-card profile-loading" aria-live="polite">
        <p>Oturumun kontrol ediliyor…</p>
      </main>
    </div>
  );
}

export default function ProtectedTransferRoute() {
  const { status } = useAuth();

  if (status === "loading") return <SessionLoading />;
  return <TransferPage />;
}

import { adminApi } from "./admin-api.js";
import DashboardPage from "./DashboardPage.jsx";
import LogsPage from "./LogsPage.jsx";
import TransactionsPage from "./TransactionsPage.jsx";
import UsersPage from "./UsersPage.jsx";
import "./admin.css";

export default function AdminApp({ api = adminApi }) {
  const section = window.location.pathname.replace(/\/$/, "").split("/")[2] ?? "";
  if (section === "kullanicilar") return <UsersPage api={api} />;
  if (section === "islemler") return <TransactionsPage api={api} />;
  if (section === "loglar") return <LogsPage api={api} />;
  if (section === "audit") return <LogsPage api={api} audit />;
  return <DashboardPage api={api} />;
}

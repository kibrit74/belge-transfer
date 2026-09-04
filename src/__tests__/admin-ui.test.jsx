import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/AuthContext.jsx";
import AdminApp from "../admin/AdminApp.jsx";

const admin = {
  id: "admin-1",
  displayName: "Admin Kullanıcı",
  email: "admin@example.com",
  role: "admin",
  permissions: [
    "dashboard.view", "users.view", "users.suspend", "users.ban", "users.limits",
    "transactions.view", "logs.view", "audit.view",
  ],
};

function renderAdmin(path, api, user = admin) {
  window.history.replaceState({}, "", path);
  return render(
    <AuthContext.Provider value={{ user, status: "ready", logout: vi.fn() }}>
      <AdminApp api={api} />
    </AuthContext.Provider>,
  );
}

afterEach(() => window.history.replaceState({}, "", "/"));

it("dashboard özetlerini ve son aktiviteleri gösterir", async () => {
  const api = {
    getDashboard: vi.fn().mockResolvedValue({
      total_users: 42,
      active_users: 35,
      restricted_users: 3,
      total_transfers: 128,
      completed_transfers: 120,
      failed_transfers: 8,
      errors_24h: 2,
    }),
    getAuditLogs: vi.fn().mockResolvedValue({ logs: [{ id: "a1", action: "USER_SUSPENDED", actor_email: "admin@example.com", created_at: "2026-08-24T12:00:00Z" }] }),
  };

  renderAdmin("/admin", api);

  expect(await screen.findByText("42")).toBeInTheDocument();
  expect(screen.getByText("Toplam kullanıcı")).toBeInTheDocument();
  expect(screen.getByText("USER_SUSPENDED")).toBeInTheDocument();
});

it("kullanıcıyı banlayıp listeyi yeniler", async () => {
  const userRow = {
    id: "user-2", display_name: "Test Üye", email: "uye@example.com", plan: "free",
    role: "user", status: "active", transfers_blocked: false, created_at: "2026-08-01T10:00:00Z",
  };
  const api = {
    getUsers: vi.fn().mockResolvedValue({ users: [userRow], total: 1 }),
    getUser: vi.fn().mockResolvedValue({ user: { ...userRow, transfer_count: 5, total_size_bytes: 4096 } }),
    updateRestriction: vi.fn().mockResolvedValue({ user: { ...userRow, status: "banned" } }),
    updateLimit: vi.fn(),
  };

  renderAdmin("/admin/kullanicilar", api);
  fireEvent.click(await screen.findByRole("button", { name: "Test Üye kullanıcısını incele" }));
  fireEvent.click(await screen.findByRole("button", { name: "Kullanıcıyı banla" }));
  fireEvent.change(screen.getByLabelText("İşlem gerekçesi"), { target: { value: "Kötüye kullanım tespit edildi" } });
  fireEvent.click(screen.getByRole("button", { name: "Banı uygula" }));

  await waitFor(() => expect(api.updateRestriction).toHaveBeenCalledWith("user-2", {
    status: "banned",
    restrictedUntil: null,
    reason: "Kötüye kullanım tespit edildi",
    transfersBlocked: true,
  }));
  expect(api.getUsers).toHaveBeenCalledTimes(2);
});

it("aktarım ve sistem logu ekranlarını gerçek API sonuçlarıyla doldurur", async () => {
  const transactionApi = {
    getTransactions: vi.fn().mockResolvedValue({ transactions: [{
      id: "transfer-1", user_email: "uye@example.com", method: "secure_package",
      status: "completed", file_count: 2, total_size_bytes: 2048, created_at: "2026-08-24T10:00:00Z",
    }] }),
  };
  const { unmount } = renderAdmin("/admin/islemler", transactionApi);
  expect(await screen.findByText("uye@example.com")).toBeInTheDocument();
  expect(screen.getAllByText("Tamamlandı")).toHaveLength(2);
  unmount();

  const logApi = {
    getLogs: vi.fn().mockResolvedValue({ logs: [{
      id: "log-1", level: "error", category: "API", message: "İstek zaman aşımına uğradı",
      error_code: "TIMEOUT", created_at: "2026-08-24T11:00:00Z",
    }] }),
  };
  renderAdmin("/admin/loglar", logApi);
  expect(await screen.findByText("İstek zaman aşımına uğradı")).toBeInTheDocument();
  expect(screen.getByText("TIMEOUT")).toBeInTheDocument();
});

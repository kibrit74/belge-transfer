import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("../api/client.js", () => ({ apiRequest: apiRequestMock }));

import { AuthProvider, useAuth } from "../auth/AuthContext.jsx";

function SessionProbe() {
  const { user, status } = useAuth();
  if (status === "loading") return <span>yükleniyor</span>;
  return <span>{user ? `${user.role}:${user.permissions.join(",")}` : "misafir"}</span>;
}

it("admin rolü ve izinlerini güvenilir backend oturumundan yükler", async () => {
  apiRequestMock.mockResolvedValue({
    user: {
      id: "admin-1",
      email: "admin@example.com",
      displayName: "Admin",
      avatarUrl: null,
      plan: "free",
      role: "admin",
      status: "active",
      permissions: ["dashboard.view", "users.view"],
    },
  });

  render(<AuthProvider><SessionProbe /></AuthProvider>);

  expect(await screen.findByText("admin:dashboard.view,users.view")).toBeInTheDocument();
  expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/session");
});

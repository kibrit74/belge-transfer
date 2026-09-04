import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/AuthContext.jsx";
import AdminRoute from "../admin/AdminRoute.jsx";

function renderRoute(authValue, AdminComponent = () => <h1>Admin merkezi</h1>) {
  return render(
    <AuthContext.Provider value={authValue}>
      <AdminRoute AdminComponent={AdminComponent} />
    </AuthContext.Provider>,
  );
}

it("oturum yüklenirken admin içeriğini göstermez", () => {
  renderRoute({ user: null, status: "loading", logout: vi.fn() });
  expect(screen.getByText("Yetkiler kontrol ediliyor…")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Admin merkezi" })).not.toBeInTheDocument();
});

it("admin izni olmayan kullanıcıya erişim reddi gösterir", () => {
  renderRoute({
    user: { role: "user", permissions: [] },
    status: "ready",
    logout: vi.fn(),
  });
  expect(screen.getByRole("heading", { name: "Bu alan için yetkiniz yok." })).toBeInTheDocument();
});

it("en az bir admin görüntüleme izni olan kullanıcıya paneli açar", () => {
  renderRoute({
    user: { role: "analyst", permissions: ["dashboard.view"] },
    status: "ready",
    logout: vi.fn(),
  });
  expect(screen.getByRole("heading", { name: "Admin merkezi" })).toBeInTheDocument();
});

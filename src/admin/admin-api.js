import { apiRequest } from "../api/client.js";

function withQuery(path, values = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function patch(path, body) {
  return apiRequest(path, { method: "PATCH", body: JSON.stringify(body) });
}

export const adminApi = {
  getDashboard: () => apiRequest("/api/admin/dashboard"),
  getUsers: (filters) => apiRequest(withQuery("/api/admin/users", filters)),
  getUser: (id) => apiRequest(`/api/admin/users/${encodeURIComponent(id)}`),
  updateRestriction: (id, input) => patch(`/api/admin/users/${encodeURIComponent(id)}/restriction`, input),
  updateLimit: (id, input) => patch(`/api/admin/users/${encodeURIComponent(id)}/limit`, input),
  getTransactions: (filters) => apiRequest(withQuery("/api/admin/transactions", filters)),
  getLogs: (filters) => apiRequest(withQuery("/api/admin/logs", filters)),
  getAuditLogs: (filters) => apiRequest(withQuery("/api/admin/audit-logs", filters)),
};

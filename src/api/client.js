import { getNeonAccessToken } from "../auth/neon-client.js";

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") headers.set("X-VaultDrop-Request", "1");
  const accessToken = await getNeonAccessToken();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "İşlem tamamlanamadı.");
    error.status = response.status;
    if (typeof data.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(data.code)) {
      error.code = data.code;
    }
    throw error;
  }
  return data;
}

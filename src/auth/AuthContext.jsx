import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authClient } from "./neon-client.js";
import { resumePendingTransferFinalizations } from "../transfer/activity-client.js";
import { apiRequest } from "../api/client.js";

export const AuthContext = createContext({ user: null, status: "ready", logout: async () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/session")
      .then((result) => active && setUser(result?.user ?? null))
      .catch(() => active && setUser(null))
      .finally(() => active && setStatus("ready"));
    return () => { active = false; };
  }, []);

  useEffect(() => resumePendingTransferFinalizations(user), [user]);

  const value = useMemo(() => ({
    user,
    status,
    async logout() {
      if (authClient) await authClient.signOut();
      setUser(null);
      window.location.href = "/";
    },
  }), [status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

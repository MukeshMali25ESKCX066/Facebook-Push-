import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./auth-context";
import { getCurrentUser } from "./services/authService";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCurrentUser();
      setUser(result.user || null);
      setSession(result);
      return result;
    } catch (requestError) {
      if (requestError.status === 401) {
        setUser(null);
        setSession(null);
        return null;
      }
      setError(requestError);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((result) => {
        if (!active) return;
        setUser(result.user || null);
        setSession(result);
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.status !== 401) setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const acceptAuth = useCallback((result) => {
    setUser(result.user || null);
    setSession(result);
    setError(null);
    setLoading(false);
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setSession(null);
    setError(null);
    setLoading(false);
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    error,
    refresh,
    acceptAuth,
    clearAuth
  }), [user, session, loading, error, refresh, acceptAuth, clearAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

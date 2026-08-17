import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { fetchRuntimeProductConfig } from "../services/runtimeProductConfig";
import { useAuth } from "../context/AuthContext";

export function RuntimeFeatureRoute({ feature, children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, enabled: true });

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user)
      .then((config) => { if (active) setState({ loading: false, enabled: config?.features?.[feature]?.enabled !== false }); })
      .catch((error) => { console.error("Unable to load runtime feature config", error); if (active) setState({ loading: false, enabled: true }); });
    return () => { active = false; };
  }, [feature, user]);

  if (state.loading) return <div className="min-h-screen flex items-center justify-center"><p>Loading feature settings...</p></div>;
  return state.enabled ? children : <Navigate to="/dashboard" replace />;
}

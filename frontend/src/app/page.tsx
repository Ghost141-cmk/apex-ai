"use client";
import { useState, useEffect } from "react";
import { api } from "@/services/api";
import Dashboard from "@/components/Dashboard";
import AuthScreen from "@/components/AuthScreen";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    // Check if already logged in
    const token = typeof window !== "undefined" ? localStorage.getItem("apex_token") : null;
    if (token) {
      api.getMe()
        .then(u => { setUser(u); setLoggedIn(true); })
        .catch(() => localStorage.removeItem("apex_token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0F1E", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#0066FF", fontSize: 14, fontFamily: "monospace" }}>
          ⚡ Loading APEX AI...
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return <AuthScreen onLogin={(u) => { setUser(u); setLoggedIn(true); }} />;
  }

  return <Dashboard user={user} onLogout={() => { localStorage.removeItem("apex_token"); setLoggedIn(false); setUser(null); }} />;
}

"use client";
import { useState } from "react";
import { api } from "@/services/api";

export default function AuthScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const [tab, setTab]       = useState<"login"|"register">("login");
  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [pass, setPass]     = useState("");
  const [error, setError]   = useState("");
  const [msg, setMsg]       = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setMsg(""); setLoading(true);
    try {
      if (tab === "login") {
        const data = await api.login(email, pass);
        onLogin(data.user);
      } else {
        await api.register(name, email, pass);
        setMsg("Account created! Check your email to verify, then log in.");
        setTab("login");
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#0D1B2A", border: "1px solid #1A2744",
    borderRadius: 8, padding: "10px 12px", color: "#C4D9F0",
    fontSize: 13, outline: "none", marginBottom: 12,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0A0F1E", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,102,255,0.1)", border: "1px solid rgba(0,102,255,0.3)", borderRadius: 10, padding: "8px 18px" }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ color: "#C4D9F0", fontWeight: 800, fontSize: 17, letterSpacing: 1 }}>
              APEX<span style={{ color: "#0066FF" }}>AI</span>
            </span>
          </div>
          <div style={{ color: "#4A6FA5", fontSize: 12, marginTop: 6 }}>Institutional-Grade AI Trading</div>
        </div>

        <div style={{ background: "rgba(13,27,42,0.95)", border: "1px solid #1A2744", borderRadius: 14, padding: 24 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0A0F1E", borderRadius: 8, padding: 4 }}>
            {(["login","register"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "7px", borderRadius: 6, border: "none", cursor: "pointer",
                background: tab === t ? "#0066FF" : "transparent",
                color: tab === t ? "#fff" : "#4A6FA5",
                fontWeight: tab === t ? 700 : 400, fontSize: 13,
              }}>
                {t === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {tab === "register" && (
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Full Name" style={inputStyle} />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email Address" type="email" style={inputStyle} />
          <input value={pass} onChange={e => setPass(e.target.value)}
            placeholder="Password" type="password" style={inputStyle} />

          {error && <div style={{ color: "#FF4444", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          {msg   && <div style={{ color: "#00D4A8", fontSize: 12, marginBottom: 10 }}>{msg}</div>}

          <button onClick={submit} disabled={loading} style={{
            width: "100%", padding: "11px", borderRadius: 8, border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            background: loading ? "#1A2744" : "linear-gradient(135deg, #0066FF, #0044CC)",
            color: loading ? "#4A6FA5" : "#fff", fontWeight: 700, fontSize: 13,
          }}>
            {loading ? "Please wait..." : tab === "login" ? "Sign In to Trade" : "Create Account"}
          </button>

          <div style={{ textAlign: "center", marginTop: 14, color: "#4A6FA5", fontSize: 11 }}>
            🔒 JWT secured · bcrypt passwords · 2FA available
          </div>
        </div>
      </div>
    </div>
  );
}

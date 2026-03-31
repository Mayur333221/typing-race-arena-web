import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../lib/socket.jsx";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "race2024!";

export default function HomePage() {
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [adminPwd, setAdminPwd] = useState("");
  const [tab, setTab] = useState("player"); // player | admin
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleJoin(e) {
    e.preventDefault();
    setError("");
    const code = joinCode.trim().toUpperCase();
    const name = joinName.trim() || "Player";
    if (!code) { setError("Enter a room code"); return; }
    navigate(`/race/${code}?name=${encodeURIComponent(name)}`);
  }

  function handleAdminCreate(e) {
    e.preventDefault();
    setError("");
    if (adminPwd !== ADMIN_PASSWORD) { setError("Wrong password"); return; }
    setLoading(true);
    socket.emit("admin_create_room", { password: adminPwd }, (res) => {
      setLoading(false);
      if (res?.error) { setError(res.error); return; }
      navigate(`/admin?room=${res.roomId}&pwd=${encodeURIComponent(adminPwd)}`);
    });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", zIndex: 2 }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 60 }} className="animate-slide-up">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, var(--cyan), var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "var(--glow-cyan)" }}>⌨</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", background: "linear-gradient(135deg, var(--fg) 0%, var(--cyan) 60%, var(--purple) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            TYPE ARENA
          </h1>
        </div>
        <p style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.15em" }}>
          MULTIPLAYER • REAL-TIME • COMPETITIVE TYPING
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          {["⚡ Live Leaderboard", "🎵 Music", "💀 Blind Mode", "🏆 Rankings"].map(f => (
            <span key={f} className="badge badge-cyan" style={{ fontSize: 10 }}>{f}</span>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", gap: 24, width: "100%", maxWidth: 860, flexWrap: "wrap", justifyContent: "center" }}>

        {/* Player Card */}
        <div className="card card-glow animate-slide-up" style={{ flex: 1, minWidth: 320, maxWidth: 400, animationDelay: "0.1s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏎</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>Join a Race</div>
              <div style={{ fontSize: 12, color: "var(--fg3)" }}>Enter code or click invite link</div>
            </div>
          </div>

          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--fg3)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 6 }}>YOUR NAME</label>
              <input
                className="input"
                placeholder="Type your name..."
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                maxLength={24}
                autoComplete="off"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--fg3)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 6 }}>ROOM CODE</label>
              <input
                className="input"
                placeholder="e.g. ABC12345"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={12}
                autoComplete="off"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em", fontSize: 18 }}
              />
            </div>
            {tab === "player" && error && <p style={{ color: "var(--red)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: 4 }}>
              Join Race →
            </button>
          </form>
        </div>

        {/* Admin Card */}
        <div className="card animate-slide-up" style={{ flex: 1, minWidth: 320, maxWidth: 400, animationDelay: "0.2s", borderColor: "rgba(255,214,0,0.15)", boxShadow: "0 0 30px rgba(255,214,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,214,0,0.1)", border: "1px solid rgba(255,214,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👑</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>Host a Race</div>
              <div style={{ fontSize: 12, color: "var(--fg3)" }}>Create room, set rules, start race</div>
            </div>
          </div>

          <form onSubmit={handleAdminCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--fg3)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 6 }}>ADMIN PASSWORD</label>
              <input
                className="input"
                type="password"
                placeholder="Enter password..."
                value={adminPwd}
                onChange={e => setAdminPwd(e.target.value)}
                autoComplete="off"
              />
            </div>
            {error && tab !== "player" && <p style={{ color: "var(--red)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{error}</p>}
            <button type="submit" className="btn btn-gold btn-lg" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Creating..." : "Create Room →"}
            </button>
          </form>

          <div className="divider" style={{ marginTop: 20 }} />
          <p style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--font-mono)", lineHeight: 1.6 }}>
            As admin: set prompts, choose round mode, control music, kick players, view live stats.
          </p>
        </div>
      </div>

      {/* Feature strip */}
      <div style={{ marginTop: 60, display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }} className="animate-fade-in">
        {[
          { icon: "🔗", title: "Invite by Link", desc: "Share URL to join instantly" },
          { icon: "📊", title: "Live Board", desc: "Real-time WPM & accuracy" },
          { icon: "🎭", title: "4 Round Modes", desc: "From classic to nightmare" },
          { icon: "🎵", title: "9 Music Tracks", desc: "Admin curates the vibe" },
        ].map(f => (
          <div key={f.title} style={{ textAlign: "center", maxWidth: 140 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{f.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg2)" }}>{f.title}</div>
            <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

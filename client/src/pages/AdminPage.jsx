import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useSocket } from "../lib/socket.jsx";
import { ROUND_BASIC, ROUND_NO_BACKSPACE, ROUND_BLIND_AFTER_10, ROUND_BLIND_NO_BACKSPACE, ROUND_LABELS, MUSIC_TRACKS, formatWpm, formatAcc, rankMedal } from "../lib/game.js";

const PRESET_PROMPTS = [
  "The quick brown fox jumps over the lazy dog and then decided to take a nap under the old oak tree while the lazy dog watched in mild surprise.",
  "Typing fast is fun, but accuracy wins competitions. Practice daily to improve your speed and reduce costly mistakes that slow you down.",
  "Python makes it easy to build small tools and games quickly. The language is clean, readable, and powerful for rapid prototyping.",
  "Stay calm, keep your fingers relaxed, and focus on rhythm. The best typists don't rush — they find a steady pace and maintain it.",
  "In the beginning was the Word, and the Word was with the universe, and through the universe all things were made that have ever been made.",
  "The mountains stood tall against the violet sky as the last rays of sunlight painted everything in shades of amber and rose and deep crimson.",
  "Technology is neither good nor bad; nor is it neutral. Its impact depends entirely on how humanity chooses to wield its tremendous power.",
  "She opened the ancient book and found a map drawn in faded ink, with a single note at the bottom: trust the stars, not the roads.",
  "The symphony of rain on cobblestones filled the empty courtyard as he stood there wondering if time itself had chosen to pause for him.",
  "Courage is not the absence of fear but the judgment that something else is more important than your fear and your comfort zone.",
];

export default function AdminPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();

  const roomId = params.get("room");
  const password = params.get("pwd");

  const [tab, setTab] = useState("lobby");
  const [players, setPlayers] = useState([]);
  const [liveBoard, setLiveBoard] = useState([]);
  const [finalBoard, setFinalBoard] = useState([]);
  const [raceRunning, setRaceRunning] = useState(false);
  const [raceStartEpoch, setRaceStartEpoch] = useState(null);
  const [durationS, setDurationS] = useState(60);
  const [countdown, setCountdown] = useState(null);
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [promptMode, setPromptMode] = useState("preset");
  const [presetIdx, setPresetIdx] = useState(0);
  const [minWords, setMinWords] = useState(45);
  const [round, setRound] = useState(ROUND_BASIC);
  const [blindHideAfter, setBlindHideAfter] = useState(10);
  const [blindShowEvery, setBlindShowEvery] = useState(30);
  const [blindShowDuration, setBlindShowDuration] = useState(3);
  const [musicTrack, setMusicTrack] = useState(1);
  const [noMusic, setNoMusic] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notification, setNotification] = useState("");
  const [roomNotFound, setRoomNotFound] = useState(false);

  const timerRef = useRef(null);
  const inviteUrl = `${window.location.origin}/race/${roomId}`;

  const notify = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  }, []);

  useEffect(() => {
    if (!socket || !roomId || !password) return;

    socket.emit("admin_rejoin", { roomId, password }, (res) => {
      if (res?.error) {
        setRoomNotFound(true);
        return;
      }
    });

    socket.on("state", (data) => {
      if (data.prompt) setPrompt(data.prompt);
      setRaceRunning(!!data.raceRunning);
      setRaceStartEpoch(data.raceStartEpoch || null);
      if (data.durationS) setDurationS(data.durationS);
      if (data.round) setRound(data.round);
    });

    socket.on("lobby", ({ players: p }) => setPlayers(p || []));
    socket.on("live_board", ({ rows }) => setLiveBoard(rows || []));
    socket.on("stop", ({ leaderboard }) => {
      setFinalBoard(leaderboard || []);
      setRaceRunning(false);
      setRaceStartEpoch(null);
      setTab("board");
      notify("🏁 Race finished!");
    });

    socket.on("player_joined", ({ name }) => notify(`✅ ${name} joined`));
    socket.on("player_left", ({ name }) => notify(`👋 ${name} left`));

    return () => {
      socket.off("state");
      socket.off("lobby");
      socket.off("live_board");
      socket.off("stop");
      socket.off("player_joined");
      socket.off("player_left");
    };
  }, [socket, roomId, password]);

  // Countdown display
  useEffect(() => {
    if (!raceRunning || !raceStartEpoch) { setCountdown(null); return; }
    timerRef.current = setInterval(() => {
      const now = Date.now() / 1000;
      if (now < raceStartEpoch) {
        setCountdown(`Starts in ${(raceStartEpoch - now).toFixed(1)}s`);
      } else {
        const left = (raceStartEpoch + durationS) - now;
        if (left <= 0) { setCountdown("Finished"); clearInterval(timerRef.current); }
        else setCountdown(`${left.toFixed(1)}s left`);
      }
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [raceRunning, raceStartEpoch, durationS]);

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSetPrompt() {
    let p = prompt;
    if (promptMode === "preset") p = PRESET_PROMPTS[presetIdx];
    else if (promptMode === "custom") p = customPrompt.trim() || PRESET_PROMPTS[0];
    else p = PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)];

    socket.emit("admin_set_prompt", { roomId, password, prompt: p }, (res) => {
      if (res?.error) { notify("❌ " + res.error); return; }
      setPrompt(res.prompt);
      notify("✅ Prompt updated");
    });
  }

  function handleRandomPrompt() {
    socket.emit("admin_random_prompt", { roomId, password, minWords }, (res) => {
      if (res?.error) { notify("❌ " + res.error); return; }
      setPrompt(res.prompt);
      notify("🎲 Random prompt set");
    });
  }

  function handleStartRace() {
    socket.emit("admin_start", {
      roomId, password,
      settings: { durationS, round, blindHideAfter, blindShowEvery, blindShowDuration, musicTrack, noMusic }
    }, (res) => {
      if (res?.error) { notify("❌ " + res.error); return; }
      setRaceRunning(true);
      setFinalBoard([]);
      setTab("race");
      notify("🚀 Race started!");
    });
  }

  function handleReset() {
    socket.emit("admin_reset", { roomId, password }, (res) => {
      if (res?.error) { notify("❌ " + res.error); return; }
      setRaceRunning(false);
      setRaceStartEpoch(null);
      setLiveBoard([]);
      setFinalBoard([]);
      notify("🔄 Race reset");
      setTab("lobby");
    });
  }

  function handleKick(socketId, name) {
    if (!window.confirm(`Remove ${name} from the race?`)) return;
    socket.emit("admin_kick", { roomId, password, targetSocketId: socketId }, () => {
      notify(`🦵 ${name} removed`);
    });
  }

  if (!roomId || !password || roomNotFound) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, position: "relative" }}>
        <div className="card" style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
          <h2 style={{ marginBottom: 12 }}>Room not found</h2>
          <p style={{ color: "var(--fg3)", marginBottom: 24 }}>This room may have expired or the link is invalid.</p>
          <Link to="/" className="btn btn-primary">← Back to Home</Link>
        </div>
      </div>
    );
  }

  const board = raceRunning ? liveBoard : finalBoard;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>

      {/* Notification toast */}
      {notification && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 1000, background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", padding: "10px 18px", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", animation: "slide-up 0.3s ease" }}>
          {notification}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(5,8,16,0.8)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/" style={{ color: "var(--fg3)", fontSize: 20 }}>⌨</Link>
          <div style={{ width: 1, height: 24, background: "var(--border)" }} />
          <span className="badge badge-gold">👑 ADMIN</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg2)" }}>Room:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--gold)", letterSpacing: "0.15em" }}>{roomId}</span>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "var(--green)" : "var(--red)", boxShadow: connected ? "0 0 8px var(--green)" : "none" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {raceRunning && countdown && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--cyan)", padding: "6px 14px", background: "rgba(0,229,255,0.1)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(0,229,255,0.2)" }}>
              ⏱ {countdown}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={copyInvite}>
            {copied ? "✅ Copied!" : "🔗 Copy Invite Link"}
          </button>
          <span className="badge badge-green">{players.length} players</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>

        {/* Sidebar controls */}
        <div style={{ width: 340, borderRight: "1px solid var(--border)", padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>

          {/* Race Controls */}
          <div className="card card-sm" style={{ borderColor: "rgba(255,214,0,0.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>RACE CONTROLS</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>
                DURATION: {durationS}s
              </label>
              <input type="range" className="slider" min={10} max={300} step={5} value={durationS} onChange={e => setDurationS(+e.target.value)} />

              {!raceRunning ? (
                <button className="btn btn-gold" onClick={handleStartRace} style={{ marginTop: 8, animateGlow: true }} disabled={!connected}>
                  🚀 Start Race
                </button>
              ) : (
                <button className="btn btn-danger" onClick={handleReset}>
                  🔄 Reset Race
                </button>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div className="card card-sm">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>PROMPT</div>

            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {["preset", "custom", "random"].map(m => (
                <button key={m} className={`tab ${promptMode === m ? "active" : ""}`} style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setPromptMode(m)}>
                  {m === "preset" ? "📋 Preset" : m === "custom" ? "✏️ Custom" : "🎲 Random"}
                </button>
              ))}
            </div>

            {promptMode === "preset" && (
              <select className="input" value={presetIdx} onChange={e => setPresetIdx(+e.target.value)} style={{ fontSize: 12, marginBottom: 10 }}>
                {PRESET_PROMPTS.map((p, i) => (
                  <option key={i} value={i}>{p.slice(0, 60)}…</option>
                ))}
              </select>
            )}

            {promptMode === "custom" && (
              <textarea className="input" rows={4} placeholder="Type your custom prompt here…" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} style={{ resize: "vertical", fontSize: 13, lineHeight: 1.6, marginBottom: 10 }} />
            )}

            {promptMode === "random" && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 4 }}>
                  MIN WORDS (Markov): {minWords}
                </label>
                <input type="range" className="slider" min={20} max={200} step={5} value={minWords} onChange={e => setMinWords(+e.target.value)} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={handleSetPrompt}>✅ Set Prompt</button>
              <button className="btn btn-ghost btn-sm" onClick={handleRandomPrompt}>🎲 Markov</button>
            </div>
          </div>

          {/* Round Mode */}
          <div className="card card-sm">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>ROUND MODE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(ROUND_LABELS).map(([r, info]) => (
                <button key={r} onClick={() => setRound(+r)} disabled={raceRunning} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: "var(--radius-sm)", cursor: "pointer", transition: "var(--transition)",
                  background: round === +r ? `rgba(${info.color === "cyan" ? "0,229,255" : info.color === "gold" ? "255,214,0" : info.color === "purple" ? "224,64,251" : "255,23,68"},0.1)` : "var(--bg2)",
                  border: `1px solid ${round === +r ? `rgba(${info.color === "cyan" ? "0,229,255" : info.color === "gold" ? "255,214,0" : info.color === "purple" ? "224,64,251" : "255,23,68"},0.3)` : "var(--border)"}`,
                  textAlign: "left",
                }}>
                  <span style={{ fontSize: 18 }}>{info.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{info.name}</div>
                    <div style={{ fontSize: 11, color: "var(--fg3)" }}>{info.desc}</div>
                  </div>
                  {round === +r && <span style={{ marginLeft: "auto", color: "var(--cyan)", fontSize: 16 }}>●</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Blind Settings */}
          {(round === ROUND_BLIND_AFTER_10 || round === ROUND_BLIND_NO_BACKSPACE) && (
            <div className="card card-sm" style={{ borderColor: "rgba(224,64,251,0.2)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--purple)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>🙈 BLIND SETTINGS</div>
              {[
                { label: "Hide after (s)", value: blindHideAfter, set: setBlindHideAfter, min: 3, max: 60 },
                { label: "Show every (s)", value: blindShowEvery, set: setBlindShowEvery, min: 5, max: 120 },
                { label: "Show for (s)", value: blindShowDuration, set: setBlindShowDuration, min: 1, max: 10 },
              ].map(({ label, value, set, min, max }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>{label}</span>
                    <span style={{ fontSize: 11, color: "var(--purple)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{value}s</span>
                  </div>
                  <input type="range" className="slider" style={{ "--slider-color": "var(--purple)" }} min={min} max={max} value={value} onChange={e => set(+e.target.value)} />
                </div>
              ))}
            </div>
          )}

          {/* Music */}
          <div className="card card-sm">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 14 }}>🎵 MUSIC</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "var(--fg2)" }}>Disable music</span>
              <button onClick={() => setNoMusic(!noMusic)} style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                background: noMusic ? "var(--bg3)" : "var(--cyan)", transition: "var(--transition)", position: "relative"
              }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, transition: "var(--transition)", left: noMusic ? 3 : 23 }} />
              </button>
            </div>
            {!noMusic && (
              <>
                <div style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>TRACK</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                  {MUSIC_TRACKS.map(t => (
                    <button key={t.id} onClick={() => setMusicTrack(t.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                      borderRadius: 6, cursor: "pointer", transition: "var(--transition)",
                      background: musicTrack === t.id ? "rgba(0,229,255,0.1)" : "transparent",
                      border: `1px solid ${musicTrack === t.id ? "rgba(0,229,255,0.25)" : "transparent"}`,
                      textAlign: "left",
                    }}>
                      <span style={{ fontSize: 14 }}>{musicTrack === t.id ? "🎵" : "○"}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: musicTrack === t.id ? "var(--cyan)" : "var(--fg)" }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: "var(--fg3)" }}>{t.genre}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Tab bar */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 4 }}>
            <div className="tab-bar" style={{ maxWidth: 360 }}>
              {[
                { id: "lobby", label: `👥 Lobby (${players.length})` },
                { id: "prompt", label: "📝 Prompt" },
                { id: "race", label: "⚡ Live Race" },
                { id: "board", label: "🏆 Leaderboard" },
              ].map(t => (
                <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

            {/* LOBBY TAB */}
            {tab === "lobby" && (
              <div className="animate-fade-in">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>Connected Players</h2>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg3)" }}>Invite:</span>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--cyan)", background: "rgba(0,229,255,0.08)", padding: "4px 10px", borderRadius: 6, cursor: "pointer" }} onClick={copyInvite}>
                      {inviteUrl}
                    </code>
                    <button className="btn btn-primary btn-sm" onClick={copyInvite}>{copied ? "✅" : "📋"}</button>
                  </div>
                </div>

                {players.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--fg3)" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>Waiting for players to join…</p>
                    <p style={{ fontSize: 12, marginTop: 8 }}>Share the invite link above</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                    {players.map((p, i) => (
                      <div key={p.id} className="card card-sm" style={{
                        borderColor: p.ready ? "rgba(0,230,118,0.3)" : "var(--border)",
                        background: p.ready ? "rgba(0,230,118,0.04)" : "var(--surface)",
                        animationDelay: `${i * 0.05}s`
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `hsl(${(p.name.charCodeAt(0) * 47) % 360}, 60%, 40%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>
                              {p.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                              <div style={{ fontSize: 10, color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>{p.isAdmin ? "HOST" : p.id.slice(0, 8)}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                            <span className={`badge ${p.ready ? "badge-green" : "badge-cyan"}`}>{p.ready ? "READY" : "WAITING"}</span>
                            {!p.isAdmin && (
                              <button className="btn btn-danger btn-sm" onClick={() => handleKick(p.id, p.name)} style={{ padding: "2px 8px", fontSize: 10 }}>Kick</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PROMPT TAB */}
            {tab === "prompt" && (
              <div className="animate-fade-in">
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Current Prompt</h2>
                <div className="card" style={{ fontFamily: "var(--font-mono)", fontSize: 16, lineHeight: 2, color: "var(--fg2)", borderColor: "rgba(0,229,255,0.15)" }}>
                  {prompt || "No prompt set"}
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>
                    {prompt?.split(" ").length || 0} words • {prompt?.length || 0} chars
                  </span>
                </div>
              </div>
            )}

            {/* LIVE RACE TAB */}
            {tab === "race" && (
              <div className="animate-fade-in">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>Live Race</h2>
                  {raceRunning && countdown && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--cyan)" }}>⏱ {countdown}</div>
                  )}
                </div>
                <LeaderboardTable rows={liveBoard} isLive />
              </div>
            )}

            {/* BOARD TAB */}
            {tab === "board" && (
              <div className="animate-fade-in">
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Final Leaderboard</h2>
                <LeaderboardTable rows={finalBoard.length > 0 ? finalBoard : liveBoard} />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardTable({ rows, isLive }) {
  if (!rows?.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--fg3)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
          {isLive ? "Waiting for players to start typing…" : "No results yet"}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.name + i} className="card card-sm" style={{
          display: "flex", alignItems: "center", gap: 16,
          borderColor: i === 0 ? "rgba(255,214,0,0.25)" : "var(--border)",
          background: i === 0 ? "rgba(255,214,0,0.03)" : "var(--surface)",
          animation: "slide-up 0.3s ease forwards",
          animationDelay: `${i * 0.04}s`,
          opacity: 0,
        }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: i < 3 ? 24 : 16, fontWeight: 700, background: i === 0 ? "rgba(255,214,0,0.15)" : i === 1 ? "rgba(200,200,200,0.1)" : i === 2 ? "rgba(180,100,40,0.1)" : "var(--bg2)", border: `1px solid ${i === 0 ? "rgba(255,214,0,0.3)" : "var(--border)"}`, color: i === 0 ? "var(--gold)" : "var(--fg2)", flexShrink: 0 }}>
            {rankMedal(i + 1)}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{r.name}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="badge badge-cyan">NET WPM: {formatWpm(r.netWpm)}</span>
              <span className="badge badge-green">ACC: {formatAcc(r.accuracy)}%</span>
              <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--font-mono)", alignSelf: "center" }}>Gross: {formatWpm(r.grossWpm)} • {r.correctChars}/{r.typedChars} chars</span>
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-mono)", color: i === 0 ? "var(--gold)" : "var(--cyan)", lineHeight: 1 }}>
              {formatWpm(r.netWpm)}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>WPM</div>
          </div>

          {isLive && r.finished && <span className="badge badge-green">✓ Done</span>}
        </div>
      ))}
    </div>
  );
}

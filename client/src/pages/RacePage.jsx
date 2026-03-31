import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useSocket } from "../lib/socket.jsx";
import {
  ROUND_BASIC, ROUND_NO_BACKSPACE, ROUND_BLIND_AFTER_10, ROUND_BLIND_NO_BACKSPACE,
  ROUND_LABELS, MUSIC_TRACKS, computeMetrics, formatWpm, formatAcc, rankMedal, buildCharSpans, now
} from "../lib/game.js";

export default function RacePage() {
  const { roomId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
const [playerName, setPlayerName] = useState(params.get("name") || "");
const [nameSubmitted, setNameSubmitted] = useState(!!params.get("name"));

  // Connection state
  const [phase, setPhase] = useState("joining"); // joining | lobby | countdown | race | finished | error
  const [errorMsg, setErrorMsg] = useState("");
  const [socketId, setSocketId] = useState("");

  // Game state
  const [prompt, setPrompt] = useState("");
  const [raceRunning, setRaceRunning] = useState(false);
  const [raceStartEpoch, setRaceStartEpoch] = useState(null);
  const [durationS, setDurationS] = useState(60);
  const [roundMode, setRoundMode] = useState(ROUND_BASIC);
  const [blindConfig, setBlindConfig] = useState({ hideAfter: 10, showEvery: 30, showDuration: 3 });
  const [musicTrack, setMusicTrack] = useState(1);
  const [noMusic, setNoMusic] = useState(false);

  // Typing state
  const [typed, setTyped] = useState("");
  const blindBuffer = useRef("");
const typedRef = useRef("");
const promptRef = useRef("");
const durationRef = useRef(60);
const roundModeRef = useRef(ROUND_BASIC);
const sentResultRef = useRef(false);
  const [isBlindHidden, setIsBlindHidden] = useState(false);
  const [blindMsg, setBlindMsg] = useState("");
  const blindCycleJob = useRef(null);
  const [allowTyping, setAllowTyping] = useState(false);

  // Metrics state
  const [metrics, setMetrics] = useState(null);
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [sentResult, setSentResult] = useState(false);
  const lastProgressRef = useRef(0);

  // UI state
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [progressPct, setProgressPct] = useState(0);
  const [ready, setReady] = useState(false);
  const [players, setPlayers] = useState([]);
  const [liveBoard, setLiveBoard] = useState([]);
  const [finalBoard, setFinalBoard] = useState([]);
  const [tab, setTab] = useState("type");
  const [muted, setMuted] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const inputRef = useRef(null);
  const tickRef = useRef(null);
  const audioRef = useRef(null);

  // ==================== MUSIC ====================

  const playMusic = useCallback((track) => {
    if (noMusic) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      const audio = new Audio(`/music/${track}.mp3`);
      audio.loop = true;
      audio.volume = muted ? 0 : 0.6;
      audio.play().catch(() => {}); // browsers may block autoplay until user gesture
      audioRef.current = audio;
    } catch (e) { /* no audio file, silently ignore */ }
  }, [noMusic, muted]);

  const stopMusic = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  // ADD after all the useState declarations (before the useEffect for JOIN):
useEffect(() => { typedRef.current = typed; }, [typed]);
useEffect(() => { promptRef.current = prompt; }, [prompt]);
useEffect(() => { durationRef.current = durationS; }, [durationS]);
useEffect(() => { roundModeRef.current = roundMode; }, [roundMode]);
useEffect(() => { sentResultRef.current = sentResult; }, [sentResult]);
  // ==================== JOIN ====================
  useEffect(() => {
   if (!socket || !roomId || !nameSubmitted || phase !== "joining") return;

    setSocketId(socket.id || "");

    socket.emit("join", { roomId: roomId.toUpperCase(), name: playerName }, (res) => {
      if (res?.error) {
        setErrorMsg(res.error);
        setPhase("error");
        return;
      }
      setPhase("lobby");
    });

    socket.on("state", (data) => {
      if (data.prompt) setPrompt(data.prompt);
      setDurationS(data.durationS || 60);
      setRaceStartEpoch(data.raceStartEpoch || null);
      setRaceRunning(!!data.raceRunning);
      if (data.round) setRoundMode(data.round);
    });

    socket.on("lobby", ({ players: p }) => setPlayers(p || []));

    socket.on("start", (data) => {
      setPrompt(data.prompt);
      setDurationS(data.durationS);
      setRaceStartEpoch(data.raceStartEpoch);
      setRaceRunning(true);
      setRoundMode(data.round || ROUND_BASIC);
      setBlindConfig({ hideAfter: data.blindHideAfter || 10, showEvery: data.blindShowEvery || 30, showDuration: data.blindShowDuration || 3 });
      setMusicTrack(data.musicTrack || 1);
      setNoMusic(!!data.noMusic);

      // Reset typing
      setTyped("");
      blindBuffer.current = "";
      setIsBlindHidden(false);
      setBlindMsg("");
      setAllowTyping(false);
      setSentResult(false);
      setMetrics(null);
      setLiveMetrics(null);
      setFinalBoard([]);
      setShowResults(false);
      setPhase("countdown");

      if (blindCycleJob.current) clearTimeout(blindCycleJob.current);
      blindCycleJob.current = null;
    });

    socket.on("live_board", ({ rows }) => setLiveBoard(rows || []));

    socket.on("stop", ({ leaderboard }) => {
      setFinalBoard(leaderboard || []);
      setRaceRunning(false);
      setRaceStartEpoch(null);
      stopMusic();
      // Only submit result if the player actually participated (typed something or race was running)
      if (!sentResultRef.current) { finishRace(); }
      setPhase("finished");
      setTab("board");
    });

    socket.on("reset", () => {
      setPhase("lobby");
      setTyped("");
      blindBuffer.current = "";
      setIsBlindHidden(false);
      setBlindMsg("");
      setAllowTyping(false);
      setSentResult(false);
      setMetrics(null);
      setLiveMetrics(null);
      setFinalBoard([]);
      setLiveBoard([]);
      setShowResults(false);
      stopMusic();
      if (blindCycleJob.current) clearTimeout(blindCycleJob.current);
      blindCycleJob.current = null;
    });

    socket.on("kicked", ({ reason }) => {
      alert(`You were removed: ${reason}`);
      navigate("/");
    });

    socket.on("server_shutdown", () => {
      alert("Admin stopped the server.");
      navigate("/");
    });

    return () => {
      socket.off("state"); socket.off("lobby"); socket.off("start");
      socket.off("live_board"); socket.off("stop"); socket.off("reset");
      socket.off("kicked"); socket.off("server_shutdown");
    };
}, [socket, roomId, nameSubmitted, playerName]);

  // ==================== TIMER TICK ====================
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!raceRunning || !raceStartEpoch) return;

    tickRef.current = setInterval(() => {
      const t = now();
      const start = raceStartEpoch;
      const end = start + durationS;

      if (t < start) {
        const rem = start - t;
        setCountdown(rem.toFixed(1));
        setTimeLeft(null);
        setProgressPct(0);
        setAllowTyping(false);
      } else if (t < end) {
        setCountdown(null);
        if (!allowTyping) {
          setAllowTyping(true);
          setPhase("race");
          setTimeout(() => inputRef.current?.focus(), 50);
          playMusic(musicTrack);
        }
        const left = end - t;
        setTimeLeft(left.toFixed(1));
        const pct = ((durationS - left) / durationS) * 100;
        setProgressPct(Math.min(100, pct));

        // Blind mode: start cycle after hideAfter
        const elapsed = t - start;
        if ((roundMode === ROUND_BLIND_AFTER_10 || roundMode === ROUND_BLIND_NO_BACKSPACE) && elapsed >= blindConfig.hideAfter && !blindCycleJob.current) {
          startBlindCycle();
        }

        // Send progress
        if (t - lastProgressRef.current > 0.4) {
          const currentTyped = (roundMode === ROUND_BLIND_AFTER_10 || roundMode === ROUND_BLIND_NO_BACKSPACE) ? blindBuffer.current : typed;
          const m = computeMetrics(prompt, currentTyped, Math.max(elapsed, 0.01));
          setLiveMetrics(m);
          socket?.emit("progress", {
            typedChars: m.typedChars, correctChars: m.correctChars,
            grossWpm: m.grossWpm, accuracy: m.accuracy, netWpm: m.netWpm, timeS: m.timeS
          });
          lastProgressRef.current = t;
        }
      } else {
        clearInterval(tickRef.current);
        if (!sentResultRef.current) finishRace();
      }
    }, 80);

    return () => clearInterval(tickRef.current);
  }, [raceRunning, raceStartEpoch, durationS, roundMode, prompt, typed, allowTyping, playMusic, musicTrack]);

  // ==================== BLIND CYCLE ====================
  function startBlindCycle() {
    if (blindCycleJob.current) return;
    setIsBlindHidden(true);
    setBlindMsg("🙈 Blind mode — keep typing, keystrokes are captured!");

    function cycle() {
      setIsBlindHidden(false);
      setBlindMsg("👀 Brief preview…");
      blindCycleJob.current = setTimeout(() => {
        setIsBlindHidden(true);
        setBlindMsg("🙈 Blind mode — keep typing!");
        blindCycleJob.current = setTimeout(cycle, blindConfig.showEvery * 1000);
      }, blindConfig.showDuration * 1000);
    }

    blindCycleJob.current = setTimeout(cycle, blindConfig.showEvery * 1000);
  }

  // ==================== FINISH ====================
  const finishRace = useCallback(() => {
    if (sentResultRef.current) return;
    setSentResult(true);
    sentResultRef.current = true;
    setAllowTyping(false);
    stopMusic();

    const currentTyped = (roundModeRef.current === ROUND_BLIND_AFTER_10 || roundModeRef.current === ROUND_BLIND_NO_BACKSPACE)
      ? blindBuffer.current
      : typedRef.current;

    const m = computeMetrics(promptRef.current, currentTyped, durationRef.current);
    setMetrics(m);
    setShowResults(true);

    socket?.emit("result", {
      name: playerName,
      typedChars: m.typedChars, correctChars: m.correctChars,
      grossWpm: m.grossWpm, accuracy: m.accuracy, netWpm: m.netWpm, timeS: m.timeS
    });
  }, [socket, playerName, stopMusic]);

  // ==================== KEYBOARD HANDLER ====================
  function handleKeyDown(e) {
    if (!allowTyping) return;

    // Block anticheat
    if ((e.ctrlKey || e.metaKey) && ["v","c","x","z","y","a"].includes(e.key.toLowerCase())) { e.preventDefault(); return; }

    // No backspace rounds
    if ((roundMode === ROUND_NO_BACKSPACE || roundMode === ROUND_BLIND_NO_BACKSPACE) && e.key === "Backspace") { e.preventDefault(); return; }

    // Blind rounds: capture all into buffer
    if (roundMode === ROUND_BLIND_AFTER_10 || roundMode === ROUND_BLIND_NO_BACKSPACE) {
      if (e.key === "Backspace") {
        blindBuffer.current = blindBuffer.current.slice(0, -1);
        if (!isBlindHidden) setTyped(blindBuffer.current);
        e.preventDefault(); return;
      }
      if (e.key.length === 1) {
        blindBuffer.current += e.key;
        if (!isBlindHidden) setTyped(blindBuffer.current);
        e.preventDefault(); return;
      }
    }
  }

  function handleChange(e) {
    if (!allowTyping) return;
    if (roundMode === ROUND_BLIND_AFTER_10 || roundMode === ROUND_BLIND_NO_BACKSPACE) return;
    setTyped(e.target.value);
  }

  function handleReadyToggle() {
    const next = !ready;
    setReady(next);
    socket?.emit("ready", { ready: next });
  }

  // ==================== RENDER TYPED PROMPT ====================
  function renderPrompt() {
    if (!prompt) return null;
    const currentTyped = typed;
    return (
      <div className="typing-prompt" style={{ userSelect: "none", position: "relative" }}>
        {prompt.split("").map((ch, i) => {
          let cls = "char-pending";
          if (i < currentTyped.length) {
            cls = currentTyped[i] === ch ? "char-correct" : "char-wrong";
          }
          const isCursor = i === currentTyped.length;
          return (
            <span key={i} className={cls} style={isCursor ? { borderLeft: "2px solid var(--cyan)", animation: "blink-cursor 0.8s steps(1) infinite", marginLeft: -1 } : {}}>
              {ch}
            </span>
          );
        })}
        {currentTyped.length >= prompt.length && (
          <span style={{ color: "var(--cyan)", animation: "blink-cursor 0.8s steps(1) infinite", borderLeft: "2px solid var(--cyan)" }}>&nbsp;</span>
        )}
        {/* Extra chars */}
        {currentTyped.length > prompt.length && currentTyped.slice(prompt.length).split("").map((ch, i) => (
          <span key={"extra" + i} className="char-extra">{ch}</span>
        ))}
      </div>
    );
  }

  // ==================== MY RANK ===================
  const myRank = (phase === "finished" ? finalBoard : liveBoard).findIndex(r => r.name === playerName);

  // ==================== ERROR / LOADING ====================
  if (phase === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2 }}>
        <div className="card" style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
          <h2 style={{ marginBottom: 12 }}>Can't join room</h2>
          <p style={{ color: "var(--fg3)", marginBottom: 24 }}>{errorMsg || "Room not found or server unavailable."}</p>
          <Link to="/" className="btn btn-primary">← Back to Home</Link>
        </div>
      </div>
    );
  }

  if (!nameSubmitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2 }}>
        <div className="card card-glow animate-slide-up" style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⌨️</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Join Room <span style={{ color: "var(--cyan)", fontFamily: "var(--font-mono)" }}>{roomId}</span></h2>
          <p style={{ color: "var(--fg3)", marginBottom: 24, fontSize: 14 }}>Enter your name to join the race</p>
          <form onSubmit={e => { e.preventDefault(); if (playerName.trim()) setNameSubmitted(true); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              className="input"
              placeholder="Your name..."
              value={playerName}
              onChange={e => setPlayerName(e.target.value.slice(0, 24))}
              autoFocus
              autoComplete="off"
              style={{ fontSize: 18, textAlign: "center", letterSpacing: "0.05em" }}
            />
            <button type="submit" className="btn btn-primary btn-lg" disabled={!playerName.trim()}>
              Enter Race →
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase === "joining") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center" }}>
          <div className="animate-float" style={{ fontSize: 48, marginBottom: 16 }}>⌨</div>
          <div style={{ fontFamily: "var(--font-mono)", color: "var(--fg3)" }}>Joining room {roomId}…</div>
        </div>
      </div>
    );
  }

  const roundInfo = ROUND_LABELS[roundMode];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>

      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(5,8,16,0.8)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/" style={{ color: "var(--fg3)", fontSize: 18 }}>⌨</Link>
          <div style={{ width: 1, height: 20, background: "var(--border)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg3)" }}>Room</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--cyan)", letterSpacing: "0.15em" }}>{roomId}</span>
          <span className={`badge badge-${roundInfo.color === "cyan" ? "cyan" : roundInfo.color === "gold" ? "gold" : roundInfo.color === "purple" ? "purple" : "red"}`}>
            {roundInfo.icon} {roundInfo.name}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Timer display */}
          {countdown && phase === "countdown" && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--gold)", padding: "4px 14px", background: "rgba(255,214,0,0.1)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(255,214,0,0.2)" }}>
              🚀 {countdown}s
            </div>
          )}
          {timeLeft && phase === "race" && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: +timeLeft < 10 ? "var(--red)" : "var(--cyan)" }}>
              ⏱ {timeLeft}s
            </div>
          )}

          {/* Live metrics */}
          {liveMetrics && phase === "race" && (
            <div style={{ display: "flex", gap: 8 }}>
              <span className="badge badge-cyan">⚡ {formatWpm(liveMetrics.netWpm)} WPM</span>
              <span className="badge badge-green">{formatAcc(liveMetrics.accuracy)}%</span>
            </div>
          )}

          {/* My rank */}
          {myRank >= 0 && phase === "race" && (
            <span className="badge badge-gold" style={{ animation: "rank-pop 0.4s ease" }}>
              {rankMedal(myRank + 1)} of {liveBoard.length}
            </span>
          )}

          {/* Mute */}
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const next = !muted;
            setMuted(next);
            if (audioRef.current) audioRef.current.volume = next ? 0 : 0.6;
          }} title={muted ? "Unmute" : "Mute"}>
              {muted ? "🔇" : "🔊"}
          </button>

          <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "var(--green)" : "var(--red)" }} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-track" style={{ height: 4, borderRadius: 0 }}>
        <div className="progress-fill" style={{ width: `${progressPct}%`, borderRadius: 0, transition: "width 0.15s linear" }} />
      </div>

      {/* Countdown overlay */}
      {phase === "countdown" && countdown && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5,8,16,0.8)", backdropFilter: "blur(8px)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 120, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--cyan)", lineHeight: 1, animation: "countdown 1s ease forwards", textShadow: "0 0 40px rgba(0,229,255,0.5)" }}>
              {Math.ceil(parseFloat(countdown))}
            </div>
            <div style={{ fontSize: 18, color: "var(--fg3)", marginTop: 16, fontFamily: "var(--font-mono)" }}>
              Get ready to type!
            </div>
            <div style={{ marginTop: 12 }}>
              <span className={`badge badge-${roundInfo.color === "cyan" ? "cyan" : roundInfo.color === "gold" ? "gold" : roundInfo.color === "purple" ? "purple" : "red"}`} style={{ fontSize: 14, padding: "6px 16px" }}>
                {roundInfo.icon} {roundInfo.name} — {roundInfo.desc}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>

        {/* Main typing area */}
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>

          {/* Lobby state */}
          {phase === "lobby" && (
            <div className="card card-glow animate-slide-up" style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }} className="animate-float">⏳</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Waiting for race to start…</h2>
              <p style={{ color: "var(--fg3)", marginBottom: 24 }}>
                Admin will start the race soon. Toggle ready when you're set!
              </p>
              <button
                className={`btn btn-lg ${ready ? "btn-ghost" : "btn-primary"}`}
                onClick={handleReadyToggle}
              >
                {ready ? "✅ I'm Ready!" : "🙋 Mark as Ready"}
              </button>
              {prompt && (
                <div style={{ marginTop: 32, textAlign: "left" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>UPCOMING PROMPT PREVIEW</div>
                  <div className="card" style={{ fontFamily: "var(--font-mono)", fontSize: 15, lineHeight: 1.9, color: "var(--fg3)" }}>
                    {prompt}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Typing interface */}
          {(phase === "race" || phase === "countdown") && (
            <>
              {/* Prompt display */}
              <div className="card" style={{ borderColor: "rgba(0,229,255,0.12)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>PROMPT</div>
                {renderPrompt()}
              </div>

              {/* Blind hint */}
              {blindMsg && (
                <div style={{ padding: "8px 14px", background: "rgba(224,64,251,0.08)", border: "1px solid rgba(224,64,251,0.2)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--purple)" }}>
                  {blindMsg}
                </div>
              )}

              {/* Input area */}
              <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, borderColor: allowTyping ? "rgba(0,229,255,0.2)" : "var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>TYPE HERE</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {roundMode !== ROUND_BASIC && <span className="badge badge-gold">{roundInfo.icon} {roundInfo.name}</span>}
                    {allowTyping && <span className="badge badge-green">● LIVE</span>}
                  </div>
                </div>
                <textarea
                  ref={inputRef}
                  value={(roundMode === ROUND_BLIND_AFTER_10 || roundMode === ROUND_BLIND_NO_BACKSPACE) && isBlindHidden ? "" : typed}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onPaste={e => e.preventDefault()}
                  onCopy={e => e.preventDefault()}
                  onCut={e => e.preventDefault()}
                  disabled={!allowTyping}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  placeholder={allowTyping ? "Start typing..." : "Race hasn't started yet…"}
                  style={{
                    flex: 1, minHeight: 160, resize: "none", width: "100%",
                    background: "var(--bg2)", color: "var(--fg)",
                    border: `1px solid ${allowTyping ? "rgba(0,229,255,0.3)" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)", padding: "14px",
                    fontFamily: "var(--font-mono)", fontSize: 16, lineHeight: 1.8,
                    outline: "none", transition: "border-color 0.2s",
                    boxShadow: allowTyping ? "0 0 0 3px rgba(0,229,255,0.08)" : "none",
                    cursor: "text",
                    // Visually hide in blind mode but keep in DOM + focusable
                    visibility: isBlindHidden ? "hidden" : "visible",
                    position: isBlindHidden ? "absolute" : "relative",
                    pointerEvents: isBlindHidden ? "none" : "auto",
                  }}
                />
                {/* Blind mode overlay — shown instead of textarea when hidden */}
                {isBlindHidden && allowTyping && (
                  <div style={{ minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(224,64,251,0.04)", border: "1px solid rgba(224,64,251,0.2)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--purple)", gap: 10, flexDirection: "column" }}>
                    <span style={{ fontSize: 32 }}>🙈</span>
                    <span>Blind mode active — keep typing!</span>
                    <span style={{ fontSize: 12, color: "var(--fg3)" }}>({(roundMode === ROUND_BLIND_AFTER_10 || roundMode === ROUND_BLIND_NO_BACKSPACE) ? blindBuffer.current.length : typed.length} chars captured)</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Finished state */}
          {phase === "finished" && metrics && (
            <div className="animate-slide-up">
              <div className="card" style={{ borderColor: "rgba(0,230,118,0.25)", background: "rgba(0,230,118,0.03)", marginBottom: 16, textAlign: "center", padding: "32px" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>
                  {myRank === 0 ? "🥇" : myRank === 1 ? "🥈" : myRank === 2 ? "🥉" : "🏁"}
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
                  {myRank === 0 ? "🏆 You Won!" : myRank === 1 ? "🥈 2nd Place!" : myRank === 2 ? "🥉 3rd Place!" : myRank > 2 ? `#${myRank + 1} Place` : "🏁 Race Complete!"}
                </h2>
                <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
                  <ResultStat label="Net WPM" value={formatWpm(metrics.netWpm)} color="var(--cyan)" big />
                  <ResultStat label="Accuracy" value={`${formatAcc(metrics.accuracy)}%`} color="var(--green)" big />
                  <ResultStat label="Gross WPM" value={formatWpm(metrics.grossWpm)} color="var(--fg2)" />
                  <ResultStat label="Correct" value={`${metrics.correctChars}/${metrics.typedChars}`} color="var(--fg2)" />
                </div>
              </div>

              {/* Typed text review */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>YOUR TYPED TEXT</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, lineHeight: 2 }}>
                  {(() => {
                    const t = (roundMode === ROUND_BLIND_AFTER_10 || roundMode === ROUND_BLIND_NO_BACKSPACE) ? blindBuffer.current : typed;
                    return t.split("").map((ch, i) => {
                      const correct = i < prompt.length && ch === prompt[i];
                      const extra = i >= prompt.length;
                      return (
                        <span key={i} style={{
                          color: extra ? "var(--orange)" : correct ? "var(--green)" : "var(--red)",
                          background: extra ? "rgba(255,145,0,0.1)" : correct ? "transparent" : "rgba(255,23,68,0.1)",
                          borderRadius: 2,
                        }}>{ch}</span>
                      );
                    });
                  })()}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--fg3)" }}>
                  <span style={{ color: "var(--green)" }}>■</span> Correct &nbsp;
                  <span style={{ color: "var(--red)" }}>■</span> Wrong &nbsp;
                  <span style={{ color: "var(--orange)" }}>■</span> Extra
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Sidebar: Players + Leaderboard */}
        <div style={{ width: 280, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <div className="tab-bar">
              <button className={`tab ${tab === "type" ? "active" : ""}`} onClick={() => setTab("type")} style={{ fontSize: 11 }}>👥 Players</button>
              <button className={`tab ${tab === "board" ? "active" : ""}`} onClick={() => setTab("board")} style={{ fontSize: 11 }}>🏆 Board</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>

            {tab === "type" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>
                  CONNECTED ({players.length})
                </div>
                {players.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: "var(--radius-sm)", background: p.name === playerName ? "rgba(0,229,255,0.06)" : "var(--bg2)", border: `1px solid ${p.name === playerName ? "rgba(0,229,255,0.2)" : "var(--border)"}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: `hsl(${(p.name.charCodeAt(0) * 47) % 360}, 55%, 38%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name} {p.name === playerName && <span style={{ color: "var(--cyan)", fontSize: 10 }}>(you)</span>}
                      </div>
                    </div>
                    <span className={`badge ${p.ready ? "badge-green" : "badge-cyan"}`} style={{ fontSize: 9 }}>
                      {p.ready ? "✓" : "…"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tab === "board" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--fg3)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>
                  {phase === "finished" ? "FINAL RESULTS" : "LIVE STANDINGS"}
                </div>
                {(phase === "finished" ? finalBoard : liveBoard).map((r, i) => (
                  <div key={r.name + i} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    background: r.name === playerName ? "rgba(0,229,255,0.06)" : i === 0 ? "rgba(255,214,0,0.04)" : "var(--bg2)",
                    border: `1px solid ${r.name === playerName ? "rgba(0,229,255,0.2)" : i === 0 ? "rgba(255,214,0,0.2)" : "var(--border)"}`,
                    animation: "slide-up 0.3s ease forwards",
                    animationDelay: `${i * 0.04}s`,
                    opacity: 0,
                  }}>
                    <span style={{ fontSize: i < 3 ? 14 : 11, fontWeight: 700, width: 24, textAlign: "center", flexShrink: 0 }}>
                      {rankMedal(i + 1)}
                    </span>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>{formatAcc(r.accuracy)}% acc</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "var(--font-mono)", color: i === 0 ? "var(--gold)" : r.name === playerName ? "var(--cyan)" : "var(--fg)" }}>
                        {formatWpm(r.netWpm)}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>WPM</div>
                    </div>
                  </div>
                ))}
                {(phase === "finished" ? finalBoard : liveBoard).length === 0 && (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "var(--fg3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                    {phase === "race" ? "Type to appear here!" : "No results yet"}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, color, big }) {
  return (
    <div style={{ textAlign: "center", padding: big ? "16px 24px" : "12px 18px", background: "var(--bg2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: big ? 36 : 24, fontWeight: 800, fontFamily: "var(--font-mono)", color, lineHeight: 1, animation: "wpm-climb 0.5s ease forwards" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--fg3)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", marginTop: 4 }}>{label}</div>
    </div>
  );
}

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { nanoid } from "nanoid";
// ADD after the nanoid import:
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const allowedOrigins = (process.env.CLIENT_ORIGINS || [
  "http://localhost:5173",
  "https://typing-race-arena-web.vercel.app",
].join(","))
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST"],
};

function generateMarkovPrompt(minWords) {
  return new Promise((resolve) => {
    const candidates = [
      join(__dirname, "markov.pkl"),
      join(__dirname, "..", "markov.pkl"),
    ];

    const pklPath = candidates.find(p => existsSync(p));
    if (!pklPath) {
      console.log("Pickle not found");
      resolve(null);
      return;
    }

    const script = join(__dirname, "markov_gen.py");

    execFile(
      "python3",
      [script, pklPath, String(minWords)],
      { timeout: 15000 },
      (err, stdout, stderr) => {

        console.log("STDOUT:", stdout);
        console.log("STDERR:", stderr);

        if (err) {
          console.log("EXEC ERROR:", err);
          resolve(null);
          return;
        }

        if (!stdout) {
          console.log("No stdout returned");
          resolve(null);
          return;
        }

        try {
          const data = JSON.parse(stdout.trim());
          console.log("PARSED:", data);
          resolve(data.text || null);
        } catch (e) {
          console.log("JSON PARSE ERROR:", e);
          console.log("RAW OUTPUT:", stdout);
          resolve(null);
        }
      }
    );
  });
}

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3001;

// ==================== CONSTANTS ====================
const ROUND_BASIC = 1;
const ROUND_NO_BACKSPACE = 2;
const ROUND_BLIND_AFTER_10 = 3;
const ROUND_BLIND_NO_BACKSPACE = 4;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "race2024!";

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

// ==================== ROOMS ====================
const rooms = new Map();

function createRoom(adminSocketId) {
  const roomId = nanoid(8).toUpperCase();
  const room = {
    id: roomId,
    adminSocketId,
    players: new Map(), // socketId -> player
    raceRunning: false,
    raceStartEpoch: null,
    durationS: 60,
    promptText: PRESET_PROMPTS[0],
    round: ROUND_BASIC,
    blindHideAfter: 10,
    blindShowEvery: 30,
    blindShowDuration: 3,
    musicTrack: 1,
    noMusic: false,
    liveInterval: null,
    finishTimeout: null,
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

function getPlayerRoom(socketId) {
  for (const [, room] of rooms) {
    if (room.players.has(socketId) || room.adminSocketId === socketId) {
      return room;
    }
  }
  return null;
}

function computeMetrics(prompt, typed, durationS) {
  prompt = prompt || "";
  typed = typed || "";
  const typedChars = typed.length;

  // character-level diff for correct chars
  let correct = 0;
  const minLen = Math.min(prompt.length, typed.length);
  for (let i = 0; i < minLen; i++) {
    if (prompt[i] === typed[i]) correct++;
  }

  const minutes = Math.max(durationS, 0.01) / 60;
  const grossWpm = (typedChars / 5) / minutes;
  const accuracy = (correct / Math.max(typedChars, 1)) * 100;
  const netWpm = grossWpm * (accuracy / 100);

  return {
    typedChars,
    correctChars: correct,
    grossWpm,
    accuracy,
    netWpm,
    timeS: durationS,
  };
}

function getRoomLeaderboard(room) {
  const rows = [];
  for (const [, player] of room.players) {
    if (player.result) {
      rows.push({
        name: player.name,
        netWpm: player.result.netWpm,
        accuracy: player.result.accuracy,
        grossWpm: player.result.grossWpm,
        typedChars: player.result.typedChars,
        correctChars: player.result.correctChars,
        timeS: player.result.timeS,
        finished: true,
      });
    } else if (player.progress) {
      rows.push({
        name: player.name,
        netWpm: player.progress.netWpm || 0,
        accuracy: player.progress.accuracy || 0,
        grossWpm: player.progress.grossWpm || 0,
        typedChars: player.progress.typedChars || 0,
        correctChars: player.progress.correctChars || 0,
        timeS: player.progress.timeS || 0,
        finished: false,
      });
    } else {
      rows.push({
        name: player.name,
        netWpm: 0,
        accuracy: 0,
        grossWpm: 0,
        typedChars: 0,
        correctChars: 0,
        timeS: 0,
        finished: false,
      });
    }
  }
  return rows.sort((a, b) => b.netWpm - a.netWpm || b.accuracy - a.accuracy);
}

function broadcastLobby(room) {
  const players = [];
  for (const [id, p] of room.players) {
    players.push({ id, name: p.name, ready: p.ready, isAdmin: id === room.adminSocketId });
  }
  io.to(room.id).emit("lobby", { players });
}

function broadcastLiveBoard(room) {
  if (!room.raceRunning) return;
  const rows = getRoomLeaderboard(room);
  io.to(room.id).emit("live_board", { rows });
}

function startLiveInterval(room) {
  if (room.liveInterval) clearInterval(room.liveInterval);
  room.liveInterval = setInterval(() => {
    if (!room.raceRunning) {
      clearInterval(room.liveInterval);
      room.liveInterval = null;
      return;
    }
    broadcastLiveBoard(room);
  }, 500);
}

function endRace(room) {
  if (!room.raceRunning) return;
  room.raceRunning = false;
  room.raceStartEpoch = null;
  if (room.liveInterval) {
    clearInterval(room.liveInterval);
    room.liveInterval = null;
  }
  if (room.finishTimeout) {
    clearTimeout(room.finishTimeout);
    room.finishTimeout = null;
  }

  const leaderboard = getRoomLeaderboard(room);
  io.to(room.id).emit("stop", { leaderboard });
  io.to(room.id).emit("state", getRoomState(room));
}

function getRoomState(room) {
  return {
    roomId: room.id,
    prompt: room.promptText,
    raceRunning: room.raceRunning,
    durationS: room.durationS,
    raceStartEpoch: room.raceStartEpoch,
    serverNow: Date.now() / 1000,
    round: room.round,
    blindHideAfter: room.blindHideAfter,
    blindShowEvery: room.blindShowEvery,
    blindShowDuration: room.blindShowDuration,
    musicTrack: room.musicTrack,
    noMusic: room.noMusic,
  };
}

function cleanupOldRooms() {
  const oneHour = 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.createdAt > oneHour && !room.raceRunning) {
      if (room.liveInterval) clearInterval(room.liveInterval);
      rooms.delete(id);
    }
  }
}
setInterval(cleanupOldRooms, 30 * 60 * 1000);

// ==================== SOCKET.IO ====================
io.on("connection", (socket) => {

  // ---------- ADMIN: Create Room ----------
  socket.on("admin_create_room", ({ password }, cb) => {
    if (password !== ADMIN_PASSWORD) {
      return cb?.({ error: "Wrong password" });
    }
    const room = createRoom(socket.id);
    socket.join(room.id);
    cb?.({ roomId: room.id });
    socket.emit("state", getRoomState(room));
  });

  // ---------- ADMIN: Rejoin room ----------
  socket.on("admin_rejoin", ({ roomId, password }, cb) => {
    if (password !== ADMIN_PASSWORD) return cb?.({ error: "Wrong password" });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });
    room.adminSocketId = socket.id;
    socket.join(roomId);
    cb?.({ ok: true });
    socket.emit("state", getRoomState(room));
    broadcastLobby(room);
  });

  // ---------- PLAYER: Join Room ----------
  socket.on("join", ({ roomId, name }, cb) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) return cb?.({ error: "Room not found" });

    const playerName = (name || `Player-${socket.id.slice(0, 4)}`).slice(0, 24);
    room.players.set(socket.id, {
      name: playerName,
      ready: false,
      progress: null,
      result: null,
    });

    socket.join(room.id);
    cb?.({ ok: true, roomId: room.id });
    socket.emit("state", getRoomState(room));
    broadcastLobby(room);
    // notify admin
    io.to(room.adminSocketId).emit("player_joined", { name: playerName });
  });

  // ---------- PLAYER: Ready ----------
  socket.on("ready", ({ ready }) => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.ready = !!ready;
    broadcastLobby(room);
  });

  // ---------- PLAYER: Progress ----------
  socket.on("progress", (data) => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.raceRunning) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.progress = data;
  });

  // ---------- PLAYER: Result ----------
  socket.on("result", (data) => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.result = data;
    broadcastLiveBoard(room);
  });

  // ---------- ADMIN: Set Prompt ----------
  socket.on("admin_set_prompt", ({ roomId, prompt, password }, cb) => {
    if (password !== ADMIN_PASSWORD) return cb?.({ error: "Wrong password" });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });

    room.promptText = prompt?.trim() || PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)];
    for (const [, p] of room.players) { p.result = null; p.progress = null; }

    io.to(room.id).emit("state", getRoomState(room));
    cb?.({ ok: true, prompt: room.promptText });
  });

  // ---------- ADMIN: Get Random Prompt ----------
  socket.on("admin_random_prompt", async ({ roomId, password, minWords }, cb) => {
    if (password !== ADMIN_PASSWORD) return cb?.({ error: "Wrong password" });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });

    const mw = parseInt(minWords) || 45;
    let prompt = await generateMarkovPrompt(mw);
    if (!prompt) prompt = PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)];

    room.promptText = prompt;
    for (const [, p] of room.players) { p.result = null; p.progress = null; }

    io.to(room.id).emit("state", getRoomState(room));
    cb?.({ ok: true, prompt });
  });

  // ---------- ADMIN: Start Race ----------
  socket.on("admin_start", ({ roomId, password, settings }, cb) => {
    if (password !== ADMIN_PASSWORD) return cb?.({ error: "Wrong password" });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });
    if (room.raceRunning) return cb?.({ error: "Already running" });

    // Apply settings
    room.durationS = Math.max(10, Math.min(300, parseInt(settings.durationS) || 60));
    room.round = parseInt(settings.round) || ROUND_BASIC;
    room.blindHideAfter = parseInt(settings.blindHideAfter) || 10;
    room.blindShowEvery = parseInt(settings.blindShowEvery) || 30;
    room.blindShowDuration = parseInt(settings.blindShowDuration) || 3;
    room.musicTrack = parseInt(settings.musicTrack) || 1;
    room.noMusic = !!settings.noMusic;

    // Reset players
    for (const [, p] of room.players) { p.result = null; p.progress = null; p.ready = false; }

    room.raceRunning = true;
    room.raceStartEpoch = Date.now() / 1000 + 3;

    const startPayload = {
      type: "start",
      prompt: room.promptText,
      raceStartEpoch: room.raceStartEpoch,
      serverNow: Date.now() / 1000,
      durationS: room.durationS,
      round: room.round,
      blindHideAfter: room.blindHideAfter,
      blindShowEvery: room.blindShowEvery,
      blindShowDuration: room.blindShowDuration,
      musicTrack: room.musicTrack,
      noMusic: room.noMusic,
    };

    io.to(room.id).emit("start", startPayload);
    startLiveInterval(room);

    room.finishTimeout = setTimeout(() => endRace(room), (room.durationS + 4) * 1000);

    cb?.({ ok: true });
  });

  // ---------- ADMIN: Reset Race ----------
  socket.on("admin_reset", ({ roomId, password }, cb) => {
    if (password !== ADMIN_PASSWORD) return cb?.({ error: "Wrong password" });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });

    room.raceRunning = false;
    room.raceStartEpoch = null;
    if (room.liveInterval) { clearInterval(room.liveInterval); room.liveInterval = null; }
    if (room.finishTimeout) { clearTimeout(room.finishTimeout); room.finishTimeout = null; }

    for (const [, p] of room.players) { p.result = null; p.progress = null; p.ready = false; }

    io.to(room.id).emit("reset");
    io.to(room.id).emit("state", getRoomState(room));
    broadcastLobby(room);
    cb?.({ ok: true });
  });

  // ---------- ADMIN: Kick Player ----------
  socket.on("admin_kick", ({ roomId, password, targetSocketId }, cb) => {
    if (password !== ADMIN_PASSWORD) return cb?.({ error: "Wrong password" });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit("kicked", { reason: "Removed by admin" });
      targetSocket.leave(room.id);
    }
    room.players.delete(targetSocketId);
    broadcastLobby(room);
    cb?.({ ok: true });
  });

  // ---------- ADMIN: Update Settings ----------
  socket.on("admin_update_settings", ({ roomId, password, settings }, cb) => {
    if (password !== ADMIN_PASSWORD) return cb?.({ error: "Wrong password" });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });

    if (settings.durationS !== undefined) room.durationS = parseInt(settings.durationS);
    if (settings.round !== undefined) room.round = parseInt(settings.round);
    if (settings.musicTrack !== undefined) room.musicTrack = parseInt(settings.musicTrack);
    if (settings.noMusic !== undefined) room.noMusic = !!settings.noMusic;
    cb?.({ ok: true });
  });

  // ---------- Disconnect ----------
  socket.on("disconnect", () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;

    if (room.players.has(socket.id)) {
      const player = room.players.get(socket.id);
      room.players.delete(socket.id);
      broadcastLobby(room);
      io.to(room.adminSocketId).emit("player_left", { name: player.name });
    }
  });
});

// ==================== REST API ====================
app.get("/api/room/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId?.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({
    roomId: room.id,
    playerCount: room.players.size,
    raceRunning: room.raceRunning,
    round: room.round,
  });
});

app.get("/health", (_, res) => res.json({ ok: true, rooms: rooms.size }));

httpServer.listen(PORT, () => {
  console.log(`🚀 Typing Race server running on port ${PORT}`);
});

export const ROUND_BASIC = 1;
export const ROUND_NO_BACKSPACE = 2;
export const ROUND_BLIND_AFTER_10 = 3;
export const ROUND_BLIND_NO_BACKSPACE = 4;

export const ROUND_LABELS = {
  [ROUND_BASIC]: { name: "Classic", desc: "Normal typing race", icon: "⌨️", color: "cyan" },
  [ROUND_NO_BACKSPACE]: { name: "No Backspace", desc: "No corrections allowed", icon: "🚫", color: "gold" },
  [ROUND_BLIND_AFTER_10]: { name: "Blind Mode", desc: "Text hides after timer", icon: "🙈", color: "purple" },
  [ROUND_BLIND_NO_BACKSPACE]: { name: "Nightmare", desc: "Blind + No backspace", icon: "💀", color: "red" },
};

export const MUSIC_TRACKS = [
  { id: 1, name: "Neon Rush", genre: "Synthwave" },
  { id: 2, name: "Focus Flow", genre: "Lo-fi" },
  { id: 3, name: "Sprint Mode", genre: "Drum & Bass" },
  { id: 4, name: "Deep Zone", genre: "Ambient" },
  { id: 5, name: "Cyber Race", genre: "Electronic" },
  { id: 6, name: "Night Drive", genre: "Darksynth" },
  { id: 7, name: "Overdrive", genre: "Techno" },
  { id: 8, name: "Void Walker", genre: "Atmospheric" },
  { id: 9, name: "Zero Hour", genre: "Industrial" },
];

export function now() {
  return Date.now() / 1000;
}

export function computeMetrics(prompt, typed, durationS) {
  prompt = prompt || "";
  typed = typed || "";
  const typedChars = typed.length;
  let correct = 0;
  const minLen = Math.min(prompt.length, typed.length);
  for (let i = 0; i < minLen; i++) {
    if (prompt[i] === typed[i]) correct++;
  }
  const minutes = Math.max(durationS, 0.01) / 60;
  const grossWpm = (typedChars / 5) / minutes;
  const accuracy = (correct / Math.max(typedChars, 1)) * 100;
  const netWpm = grossWpm * (accuracy / 100);
  return { typedChars, correctChars: correct, grossWpm, accuracy, netWpm, timeS: durationS };
}

export function formatWpm(n) {
  return typeof n === "number" ? n.toFixed(1) : "0.0";
}

export function formatAcc(n) {
  return typeof n === "number" ? n.toFixed(1) : "0.0";
}

export function rankMedal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

// Build colored spans array for the typing prompt
export function buildCharSpans(prompt, typed, cursorPos) {
  return prompt.split("").map((ch, i) => {
    let cls = "char-pending";
    if (i < typed.length) {
      cls = typed[i] === ch ? "char-correct" : "char-wrong";
    }
    if (i === cursorPos) cls += " char-cursor";
    return { ch, cls, i };
  });
}

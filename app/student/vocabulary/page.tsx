// app/student/vocabulary/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type PosKey =
  | "verb"
  | "noun"
  | "adj"
  | "adv"
  | "prep"
  | "pron"
  | "det"
  | "conj"
  | "interj"
  | "phrase"
  | "other";

type StoredSense = { id: string; pos: PosKey; meaning_vi: string };

type StoredWord = {
  id: string; // uuid (server)
  word: string;
  senses: StoredSense[];
  created_at: number; // ms (we store updated_at for sorting)
};

type QuizQuestion = {
  id: string;
  wordId: string;
  word: string;
  senseId: string;
  pos: PosKey;
  correct: string; // meaning_vi
  choices: string[];
  correctIndex: number;

  selectedIndex: number | null; // what student chose
  isCorrect: boolean | null; // MUST remain null until submit
};

type MasteryMap = Record<string, { mastered: boolean; updated_at: number }>;

const LS_WORDS_KEY = "lip_mv_words_v1";
const LS_LAST_SUBMIT_KEY = "lip_mv_last_submit_ms_v1";
const LS_MASTERY_KEY = "lip_mv_mastery_v1";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

// client-side uuid for word.id (must be uuid-compatible)
function uuidv4(): string {
  // modern browsers
  // @ts-ignore
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();

  // fallback (RFC4122-ish)
  let d = new Date().getTime();
  let d2 = (typeof performance !== "undefined" && performance.now && performance.now() * 1000) || 0;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    let r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16;
      d = Math.floor(d / 16);
    } else {
      r = (d2 + r) % 16;
      d2 = Math.floor(d2 / 16);
    }
    // eslint-disable-next-line no-mixed-operators
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function normWord(w: string) {
  return String(w ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function posLabel(pos: PosKey) {
  switch (pos) {
    case "verb":
      return "Verb / Động từ";
    case "noun":
      return "Noun / Danh từ";
    case "adj":
      return "Adjective / Tính từ";
    case "adv":
      return "Adverb / Trạng từ";
    case "prep":
      return "Preposition / Giới từ";
    case "pron":
      return "Pronoun / Đại từ";
    case "det":
      return "Determiner / Từ hạn định";
    case "conj":
      return "Conjunction / Liên từ";
    case "interj":
      return "Interjection / Thán từ";
    case "phrase":
      return "Phrase / Cụm từ";
    case "other":
    default:
      return "Other / Khác";
  }
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function safeReadJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * MVP distractors:
 * - Use meanings from other senses in the student's own vocabulary as distractors.
 * - If not enough, fill with placeholder strings (no GPT calls).
 */
function buildChoicesLocal(correct: string, pool: string[]) {
  const cleanCorrect = String(correct || "").trim();
  const poolClean = pool
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x) => x.toLowerCase() !== cleanCorrect.toLowerCase());

  const picks: string[] = [];
  const shuffled = shuffle(poolClean);

  for (const x of shuffled) {
    if (picks.length >= 3) break;
    if (picks.some((p) => p.toLowerCase() === x.toLowerCase())) continue;
    picks.push(x);
  }

  while (picks.length < 3) picks.push("— (MVP: đáp án gây nhiễu sẽ lấy từ các nghĩa khác)");

  const all = shuffle([cleanCorrect, ...picks]).slice(0, 4);
  const correctIndex = all.findIndex((x) => x.toLowerCase() === cleanCorrect.toLowerCase());
  return { choices: all, correctIndex: correctIndex >= 0 ? correctIndex : 0 };
}

/**
 * Pronunciation source:
 * - Web Speech API (speechSynthesis) of the browser.
 * - The actual voice/accent depends on voices installed/available on the student's device.
 */
function speakWord(text: string, locale: "en-US" | "en-GB") {
  if (typeof window === "undefined") return;
  const t = String(text || "").trim();
  if (!t) return;

  const synth = window.speechSynthesis;
  if (!synth) {
    alert("Trình duyệt không hỗ trợ phát âm (speechSynthesis).");
    return;
  }

  try {
    synth.cancel();
  } catch {}

  const u = new SpeechSynthesisUtterance(t);
  u.lang = locale;

  const voices = synth.getVoices?.() ?? [];
  const v =
    voices.find((x) => x.lang === locale) ||
    voices.find((x) => x.lang?.toLowerCase().startsWith(locale.toLowerCase())) ||
    voices.find((x) => x.lang?.toLowerCase().startsWith("en")) ||
    null;

  if (v) u.voice = v;
  synth.speak(u);
}

function splitMeanings(s: string): string[] {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function mergeMeaningComma(existing: string, incoming: string) {
  const a = splitMeanings(existing);
  const b = splitMeanings(incoming);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...a, ...b]) {
    const key = x.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out.join(", ");
}

type AddRow = { id: string; pos: PosKey; meaning_vi: string };

// ---------- Supabase row shapes ----------
type MVWordRow = {
  id: string;
  user_id: string;
  word: string;
  senses: any; // jsonb array
  mastered: boolean;
  mastered_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type MVStateRow = {
  user_id: string;
  last_submit_ms: number;
  updated_at: string;
};

export default function VocabularyPage() {
  // ---------- Styles (match student layout vars) ----------
  const styles: Record<string, React.CSSProperties> = {
    page: { display: "flex", flexDirection: "column", gap: 14, color: "var(--text-primary)" },
    topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
    h1: { fontSize: 18, fontWeight: 950, letterSpacing: 0.2, margin: 0 },
    sub: { fontSize: 12, opacity: 0.78, lineHeight: 1.6, margin: 0 },

    card: {
      borderRadius: 16,
      border: "1px solid var(--border)",
      background: "var(--bg-elev)",
      boxShadow: "var(--shadow)",
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    },
    titleRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
    cardTitle: { fontSize: 13, fontWeight: 950, letterSpacing: 0.2 },
    pill: {
      fontSize: 11,
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.04)",
      opacity: 0.9,
      whiteSpace: "nowrap",
    },

    input: {
      width: "100%",
      height: 38,
      borderRadius: 12,
      border: "1px solid var(--border)",
      background: "var(--bg-main)",
      color: "inherit",
      padding: "0 10px",
      outline: "none",
      fontSize: 13,
    },
    select: {
      height: 38,
      borderRadius: 12,
      border: "1px solid var(--border)",
      background: "var(--bg-main)",
      color: "inherit",
      padding: "0 10px",
      outline: "none",
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer",
      width: 220,
      maxWidth: "100%",
    },

    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    rowTop: { display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" },

    btnRow: { display: "flex", gap: 10, flexWrap: "wrap" },
    btnPrimary: {
      borderRadius: 12,
      padding: "10px 12px",
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.10)",
      color: "inherit",
      cursor: "pointer",
      fontWeight: 950,
      fontSize: 12,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      whiteSpace: "nowrap",
    },
    btn: {
      borderRadius: 12,
      padding: "10px 12px",
      border: "1px solid var(--border)",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      whiteSpace: "nowrap",
    },
    btnDanger: {
      borderRadius: 12,
      padding: "10px 12px",
      border: "1px solid rgba(255,120,120,0.45)",
      background: "rgba(255,120,120,0.08)",
      color: "inherit",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      whiteSpace: "nowrap",
    },

    tiny: { fontSize: 11, opacity: 0.7, lineHeight: 1.5 },
    muted: { fontSize: 12, opacity: 0.82, lineHeight: 1.6 },

    hr: { height: 1, width: "100%", background: "var(--border)", opacity: 0.9 },

    listWrap: { display: "flex", flexDirection: "column", gap: 10 },
    wordRow: {
      borderRadius: 14,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.03)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      cursor: "pointer",
      userSelect: "none",
    },
    wordRowTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
    wordTitle: { fontWeight: 950, fontSize: 14 },
    chevron: { opacity: 0.65, fontWeight: 950 },

    chip: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.04)",
      padding: "6px 10px",
      fontSize: 11,
      fontWeight: 900,
      cursor: "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
    },

    qaBlock: {
      borderRadius: 14,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.03)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
  };

  // ---------- Auth / server flags ----------
  const [userId, setUserId] = useState<string | null>(null);
  const [serverReady, setServerReady] = useState(false);
  const [loadingServer, setLoadingServer] = useState(true);

  // ---------- Local store (cached) ----------
  const [storedWords, setStoredWords] = useState<StoredWord[]>([]);
  const [mastery, setMastery] = useState<MasteryMap>({});
  const [hydrated, setHydrated] = useState(false); // ✅ prevents "save empty" race

  // local keys per user (avoid mixing users on same machine)
  const lsKey = (base: string) => (userId ? `${base}_${userId}` : base);
  const lsMigratedKey = userId ? `lip_mv_migrated_to_sb_v1_${userId}` : "lip_mv_migrated_to_sb_v1";

  // ---------- Server sync control ----------
  const dirtyRef = useRef(false);
  const syncTimerRef = useRef<any>(null);

  function markDirty() {
    dirtyRef.current = true;
  }

  async function fetchUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error(error);
      setUserId(null);
      return;
    }
    const u = data.user;
    setUserId(u?.id ?? null);
  }

  function readLocalCacheFallback() {
    // legacy keys (shared) then per-user keys (once userId exists)
    const rawWordsLegacy = typeof window !== "undefined" ? window.localStorage.getItem(LS_WORDS_KEY) : null;
    const rawMLegacy = typeof window !== "undefined" ? window.localStorage.getItem(LS_MASTERY_KEY) : null;

    const parsedWordsLegacy = safeReadJson<StoredWord[]>(rawWordsLegacy, []);
    const parsedMLegacy = safeReadJson<MasteryMap>(rawMLegacy, {});

    const legacyWords = Array.isArray(parsedWordsLegacy) ? parsedWordsLegacy : [];
    const legacyM = parsedMLegacy && typeof parsedMLegacy === "object" ? parsedMLegacy : {};

    return { legacyWords, legacyM };
  }

  function readLocalCachePerUser() {
    const rawWords = typeof window !== "undefined" ? window.localStorage.getItem(lsKey(LS_WORDS_KEY)) : null;
    const rawM = typeof window !== "undefined" ? window.localStorage.getItem(lsKey(LS_MASTERY_KEY)) : null;

    const parsedWords = safeReadJson<StoredWord[]>(rawWords, []);
    const parsedM = safeReadJson<MasteryMap>(rawM, {});
    const words = Array.isArray(parsedWords) ? parsedWords : [];
    const m = parsedM && typeof parsedM === "object" ? parsedM : {};
    return { words, m };
  }

  function writeLocalCache(words: StoredWord[], m: MasteryMap) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(lsKey(LS_WORDS_KEY), JSON.stringify(words));
    window.localStorage.setItem(lsKey(LS_MASTERY_KEY), JSON.stringify(m));
  }

  // 1) get user id first
  useEffect(() => {
    fetchUser();
  }, []);

  // 2) once we have userId, load local cache immediately (fast) then load server
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userId) return;

    // Prefer per-user cache; fallback legacy if empty.
    const { words: cachedWords, m: cachedM } = readLocalCachePerUser();
    if (cachedWords.length > 0) {
      setStoredWords(cachedWords);
      setMastery(cachedM);
    } else {
      const { legacyWords, legacyM } = readLocalCacheFallback();
      if (legacyWords.length > 0) {
        setStoredWords(legacyWords);
        setMastery(legacyM);
      }
    }

    setHydrated(true);
  }, [userId]);

  // 3) keep local cache updated (per-user) AFTER hydrated
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydrated) return;
    if (!userId) return;
    writeLocalCache(storedWords, mastery);
  }, [storedWords, mastery, hydrated, userId]);

  // ---------- Cooldown state (ONLY for "graded submit") ----------
  const [cooldownLeftMs, setCooldownLeftMs] = useState<number>(0);
  const [lastSubmitMs, setLastSubmitMs] = useState<number>(0);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const left = clamp(COOLDOWN_MS - (now - lastSubmitMs), 0, COOLDOWN_MS);
      setCooldownLeftMs(left);
    }, 500);
    return () => clearInterval(id);
  }, [lastSubmitMs]);

  const cooldownText = useMemo(() => {
    const s = Math.max(0, Math.floor(cooldownLeftMs / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }, [cooldownLeftMs]);

  // ---------- Supabase helpers ----------
  function rowToStoredWord(r: MVWordRow): StoredWord {
    const updatedMs = new Date(r.updated_at || r.created_at).getTime();
    const sensesArr: StoredSense[] = Array.isArray(r.senses)
      ? (r.senses as any[]).map((x) => ({
          id: String(x?.id || uid()),
          pos: (x?.pos as PosKey) || "noun",
          meaning_vi: String(x?.meaning_vi || "").trim(),
        }))
      : [];

    return {
      id: r.id,
      word: r.word,
      senses: sensesArr,
      created_at: updatedMs, // for sorting recency in UI
    };
  }

  function buildMasteryFromRows(rows: MVWordRow[]): MasteryMap {
    const out: MasteryMap = {};
    for (const r of rows) {
      const ms = r.mastered_updated_at ? new Date(r.mastered_updated_at).getTime() : 0;
      out[r.id] = { mastered: !!r.mastered, updated_at: ms || 0 };
    }
    return out;
  }

  async function ensureMvState(uid_: string) {
    // create row if missing (idempotent)
    const { error } = await supabase.from("mv_state").upsert(
      {
        user_id: uid_,
        last_submit_ms: 0,
      },
      { onConflict: "user_id" }
    );
    if (error) console.error(error);
  }

  async function fetchServerAll(uid_: string) {
    setLoadingServer(true);

    await ensureMvState(uid_);

    const [{ data: wordsData, error: wordsErr }, { data: stateData, error: stateErr }] = await Promise.all([
      supabase
        .from("mv_words")
        .select("id,user_id,word,senses,mastered,mastered_updated_at,created_at,updated_at")
        .eq("user_id", uid_)
        .order("updated_at", { ascending: false }),
      supabase.from("mv_state").select("user_id,last_submit_ms,updated_at").eq("user_id", uid_).maybeSingle(),
    ]);

    if (wordsErr) console.error(wordsErr);
    if (stateErr) console.error(stateErr);

    const rows = (wordsData || []) as MVWordRow[];
    const state = (stateData || null) as MVStateRow | null;

    // Apply server
    const mappedWords = rows.map(rowToStoredWord);
    const mappedMastery = buildMasteryFromRows(rows);

    setStoredWords(mappedWords);
    setMastery(mappedMastery);

    const ms = Number(state?.last_submit_ms || 0) || 0;
    setLastSubmitMs(ms);

    setServerReady(true);
    setLoadingServer(false);

    // refresh cache immediately
    if (typeof window !== "undefined") {
      window.localStorage.setItem(lsKey(LS_LAST_SUBMIT_KEY), String(ms));
      writeLocalCache(mappedWords, mappedMastery);
    }

    return { rows, state };
  }

  async function migrateLocalToServerIfNeeded(uid_: string, serverRowsCount: number) {
    if (typeof window === "undefined") return;
    const already = window.localStorage.getItem(lsMigratedKey) === "1";
    if (already) return;

    // if server already has data, mark migrated and stop
    if (serverRowsCount > 0) {
      window.localStorage.setItem(lsMigratedKey, "1");
      return;
    }

    // read local (prefer per-user, else legacy)
    const { words: perWords, m: perM } = readLocalCachePerUser();
    let localWords = perWords;
    let localM = perM;

    if (localWords.length === 0) {
      const { legacyWords, legacyM } = readLocalCacheFallback();
      localWords = legacyWords;
      localM = legacyM;
    }

    if (localWords.length === 0) {
      window.localStorage.setItem(lsMigratedKey, "1");
      return;
    }

    // map local mastery -> by word string
    const masteredByWordLc = new Map<string, { mastered: boolean; updated_at: number }>();
    for (const w of localWords) {
      const m = localM[w.id];
      const key = w.word.toLowerCase();
      if (m) masteredByWordLc.set(key, m);
    }

    // upsert all words by (user_id, word_lc)
    const payload = localWords.map((w) => {
      const key = w.word.toLowerCase();
      const m = masteredByWordLc.get(key);
      return {
        user_id: uid_,
        word: w.word,
        senses: w.senses || [],
        mastered: m?.mastered === true,
        mastered_updated_at: m?.updated_at ? new Date(m.updated_at).toISOString() : null,
      };
    });

    const { error } = await supabase.from("mv_words").upsert(payload, { onConflict: "user_id,word_lc" });
    if (error) {
      console.error(error);
      return;
    }

    // migrate last_submit (cooldown)
    const rawLegacy = window.localStorage.getItem(LS_LAST_SUBMIT_KEY);
    const rawPerUser = window.localStorage.getItem(lsKey(LS_LAST_SUBMIT_KEY));
    const ms = Number(rawPerUser || rawLegacy || "0") || 0;

    const { error: stErr } = await supabase
      .from("mv_state")
      .upsert({ user_id: uid_, last_submit_ms: ms }, { onConflict: "user_id" });

    if (stErr) console.error(stErr);

    window.localStorage.setItem(lsMigratedKey, "1");
  }

  async function syncAllToServer(uid_: string, words: StoredWord[], m: MasteryMap, lastSubmit: number) {
    // Upsert words
    const payload = words.map((w) => {
      const mm = m[w.id];
      return {
        id: w.id,
        user_id: uid_,
        word: w.word,
        senses: w.senses || [],
        mastered: mm?.mastered === true,
        mastered_updated_at: mm?.updated_at ? new Date(mm.updated_at).toISOString() : null,
      };
    });

    const { error: upErr } = await supabase.from("mv_words").upsert(payload, { onConflict: "id" });
    if (upErr) {
      console.error(upErr);
      return;
    }

    // Handle deletions: delete rows not in current ids
    const ids = words.map((w) => w.id);
    // only do delete if we have any words, else delete all user's rows
    if (ids.length === 0) {
      const { error: delAllErr } = await supabase.from("mv_words").delete().eq("user_id", uid_);
      if (delAllErr) console.error(delAllErr);
    } else {
      // Supabase supports "not in" via .not('id','in', '(...)')
      const inList = `(${ids.map((x) => `"${x}"`).join(",")})`;
      const { error: delErr } = await supabase.from("mv_words").delete().eq("user_id", uid_).not("id", "in", inList);
      if (delErr) console.error(delErr);
    }

    // Upsert state
    const { error: stErr } = await supabase.from("mv_state").upsert(
      {
        user_id: uid_,
        last_submit_ms: lastSubmit,
      },
      { onConflict: "user_id" }
    );
    if (stErr) console.error(stErr);
  }

  // 4) server load + migration
  useEffect(() => {
    if (!userId) return;

    (async () => {
      // load server first to know if empty
      const { rows } = await fetchServerAll(userId);

      // if server empty, migrate local once
      await migrateLocalToServerIfNeeded(userId, rows.length);

      // refetch after migration
      await fetchServerAll(userId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 5) Debounced auto-sync when local state changes (only after serverReady)
  useEffect(() => {
    if (!userId) return;
    if (!serverReady) return;

    if (!dirtyRef.current) return;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        const wordsSnapshot = storedWords;
        const masterySnapshot = mastery;
        const lastSubmitSnapshot = lastSubmitMs;

        await syncAllToServer(userId, wordsSnapshot, masterySnapshot, lastSubmitSnapshot);
        dirtyRef.current = false;
      } catch (e) {
        console.error(e);
      }
    }, 450);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [storedWords, mastery, lastSubmitMs, userId, serverReady]);

  // ---------- Add single word state ----------
  const [newWord, setNewWord] = useState("");
  const [addRows, setAddRows] = useState<AddRow[]>([{ id: uid(), pos: "noun", meaning_vi: "" }]);

  function addPosRow() {
    setAddRows((prev) => [...prev, { id: uid(), pos: "noun", meaning_vi: "" }]);
  }
  function removePosRow(rowId: string) {
    setAddRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)));
  }
  function updateAddRow(rowId: string, patch: Partial<AddRow>) {
    setAddRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }

  // ---------- Expand + edit state (for “My vocabulary list”) ----------
  const [openWordId, setOpenWordId] = useState<string | null>(null);
  const [editWordId, setEditWordId] = useState<string | null>(null);

  // Edit drafts for a single opened word
  const [editSenses, setEditSenses] = useState<StoredSense[]>([]);

  function openWord(wordId: string) {
    setOpenWordId((prev) => (prev === wordId ? null : wordId));
    setEditWordId(null);
  }

  function startEdit(wordId: string) {
    const w = storedWords.find((x) => x.id === wordId);
    if (!w) return;
    setEditWordId(wordId);
    setEditSenses(w.senses.map((s) => ({ ...s })));
  }

  function cancelEdit() {
    setEditWordId(null);
    setEditSenses([]);
  }

  function saveEdit(wordId: string) {
    // clean + normalize + merge duplicate POS inside editor
    const cleaned = editSenses
      .map((s) => ({ ...s, meaning_vi: String(s.meaning_vi || "").trim() }))
      .filter((s) => s.meaning_vi);

    if (cleaned.length === 0) {
      alert("Bạn cần ít nhất 1 nghĩa cho từ này.");
      return;
    }

    const byPos = new Map<PosKey, string>();
    for (const s of cleaned) {
      const prev = byPos.get(s.pos) ?? "";
      byPos.set(s.pos, mergeMeaningComma(prev, s.meaning_vi));
    }

    const merged: StoredSense[] = Array.from(byPos.entries()).map(([pos, meaning_vi]) => ({
      id: uid(),
      pos,
      meaning_vi,
    }));

    setStoredWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, senses: merged, created_at: Date.now() } : w)));

    markDirty();
    setEditWordId(null);
    setEditSenses([]);
  }

  function removeWord(wordId: string) {
    const w = storedWords.find((x) => x.id === wordId);
    if (!w) return;
    if (!confirm(`Xóa từ "${w.word}" khỏi kho?`)) return;

    setStoredWords((prev) => prev.filter((x) => x.id !== wordId));
    setMastery((prev) => {
      const next = { ...prev };
      delete next[wordId];
      return next;
    });

    markDirty();

    if (openWordId === wordId) setOpenWordId(null);
    if (editWordId === wordId) cancelEdit();
  }

  function addSenseEditRow() {
    setEditSenses((prev) => [...prev, { id: uid(), pos: "noun", meaning_vi: "" }]);
  }

  function updateEditSense(senseId: string, patch: Partial<StoredSense>) {
    setEditSenses((prev) => prev.map((s) => (s.id === senseId ? { ...s, ...patch } : s)));
  }

  function removeEditSense(senseId: string) {
    setEditSenses((prev) => prev.filter((s) => s.id !== senseId));
  }

  function addToVocabulary() {
    const w = normWord(newWord);
    if (!w) {
      alert("Bạn cần nhập từ tiếng Anh.");
      return;
    }

    // clean rows: must have meaning
    const cleanedRows = addRows
      .map((r) => ({ ...r, meaning_vi: String(r.meaning_vi || "").trim() }))
      .filter((r) => r.meaning_vi);

    if (cleanedRows.length === 0) {
      alert("Bạn cần nhập ít nhất 1 nghĩa tiếng Việt.");
      return;
    }

    // merge duplicates inside add-form by POS: pos -> "a, b"
    const incomingByPos = new Map<PosKey, string>();
    for (const r of cleanedRows) {
      const prev = incomingByPos.get(r.pos) ?? "";
      incomingByPos.set(r.pos, mergeMeaningComma(prev, r.meaning_vi));
    }

    setStoredWords((prev) => {
      const key = w.toLowerCase();
      const exist = prev.find((x) => x.word.toLowerCase() === key);

      // ✅ If the word exists:
      // - if same POS exists -> APPEND meaning by comma (unique), not overwrite
      // - else append new sense
      if (exist) {
        const senses = [...exist.senses];

        for (const [pos, incomingMeaning] of incomingByPos.entries()) {
          const idx = senses.findIndex((s) => s.pos === pos);
          if (idx >= 0) {
            senses[idx] = {
              ...senses[idx],
              meaning_vi: mergeMeaningComma(senses[idx].meaning_vi, incomingMeaning),
            };
          } else {
            senses.push({ id: uid(), pos, meaning_vi: incomingMeaning });
          }
        }

        // also de-dupe POS inside stored (safety)
        const byPos = new Map<PosKey, string>();
        for (const s of senses) {
          const prevMeaning = byPos.get(s.pos) ?? "";
          byPos.set(s.pos, mergeMeaningComma(prevMeaning, s.meaning_vi));
        }
        const mergedSenses: StoredSense[] = Array.from(byPos.entries()).map(([pos, meaning_vi]) => ({
          id: uid(),
          pos,
          meaning_vi,
        }));

        return prev
          .map((x) => (x.id === exist.id ? { ...x, senses: mergedSenses, created_at: Date.now() } : x))
          .sort((a, b) => b.created_at - a.created_at);
      }

      const senses: StoredSense[] = Array.from(incomingByPos.entries()).map(([pos, meaning_vi]) => ({
        id: uid(),
        pos,
        meaning_vi,
      }));

      const nw: StoredWord = {
        id: uuidv4(), // uuid for server
        word: w,
        senses,
        created_at: Date.now(),
      };

      return [nw, ...prev].sort((a, b) => b.created_at - a.created_at);
    });

    markDirty();

    // reset input
    setNewWord("");
    setAddRows([{ id: uid(), pos: "noun", meaning_vi: "" }]);
  }

  // ---------- Counts ----------
  const totalWords = storedWords.length;

  const masteredWords = useMemo(() => {
    let n = 0;
    for (const w of storedWords) if (mastery[w.id]?.mastered) n++;
    return n;
  }, [storedWords, mastery]);

  const totalQuizItems = useMemo(() => {
    // quiz items are still per sense (POS) — BUT total words displayed is per word
    let n = 0;
    for (const w of storedWords) n += w.senses.length;
    return n;
  }, [storedWords]);

  // ---------- Practice / Quiz ----------
  const practiceRef = useRef<HTMLDivElement | null>(null);

  const [accent, setAccent] = useState<"en-US" | "en-GB">("en-US");

  // ✅ Start is always allowed (as long as there are quiz items)
  const canStartQuiz = totalQuizItems > 0;

  const [quizStarted, setQuizStarted] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizResult, setQuizResult] = useState<{ correct: number; total: number } | null>(null);

  // ✅ whether this attempt is a "graded submit" (saved to system)
  const [isGradedAttempt, setIsGradedAttempt] = useState<boolean>(false);

  // open question panel by sense (word+pos)
  const [openQKey, setOpenQKey] = useState<string | null>(null);

  function buildQuizAttempt() {
    const pool: string[] = [];
    storedWords.forEach((w) => w.senses.forEach((s) => pool.push(s.meaning_vi)));

    const qs: QuizQuestion[] = [];
    for (const w of storedWords) {
      for (const s of w.senses) {
        const { choices, correctIndex } = buildChoicesLocal(s.meaning_vi, pool);
        qs.push({
          id: uid(),
          wordId: w.id,
          word: w.word,
          senseId: s.id,
          pos: s.pos,
          correct: s.meaning_vi,
          choices,
          correctIndex,
          selectedIndex: null,
          isCorrect: null, // IMPORTANT: remain null until submit
        });
      }
    }
    return qs;
  }

  function startQuiz() {
    if (!canStartQuiz) return;

    // ✅ If cooldown is over => this attempt will be counted/saved.
    // If not => student can still practice immediately, but result won't be saved.
    const graded = cooldownLeftMs <= 0;
    setIsGradedAttempt(graded);

    const qs = buildQuizAttempt();
    setQuizQuestions(qs);
    setQuizStarted(true);
    setQuizSubmitted(false);
    setQuizResult(null);
    setOpenQKey(null);

    // ✅ Auto scroll so only practice area is in view (reduce "accidental cheating")
    setTimeout(() => {
      practiceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function selectAnswer(qId: string, idx: number) {
    // DO NOT reveal correctness before submit
    if (quizSubmitted) return;

    setQuizQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        return { ...q, selectedIndex: idx, isCorrect: null };
      })
    );
  }

  function submitQuiz() {
    if (!quizStarted || quizSubmitted) return;

    let correct = 0;
    const total = quizQuestions.length;

    // finalize correctness ONLY at submit time
    const finalized = quizQuestions.map((q) => {
      const isCorrect = q.selectedIndex != null && q.selectedIndex === q.correctIndex;
      if (isCorrect) correct++;
      return { ...q, isCorrect };
    });

    setQuizQuestions(finalized);
    setQuizSubmitted(true);
    setQuizResult({ correct, total });

    // ✅ Practice mode: still show correct/wrong, but DO NOT save mastery / DO NOT lock 24h again.
    if (!isGradedAttempt) {
      return;
    }

    // ✅ Graded mode: Update mastery per WORD + lock 24h
    const byWord = new Map<string, QuizQuestion[]>();
    finalized.forEach((q) => {
      const arr = byWord.get(q.wordId) ?? [];
      arr.push(q);
      byWord.set(q.wordId, arr);
    });

    const now = Date.now();
    setMastery((prev) => {
      const next: MasteryMap = { ...prev };
      for (const [wordId, qs] of byWord.entries()) {
        const mastered = qs.length > 0 && qs.every((x) => x.isCorrect === true);
        next[wordId] = { mastered, updated_at: now };
      }
      return next;
    });

    // lock 24h for NEXT graded submit
    setLastSubmitMs(now);
    if (typeof window !== "undefined") window.localStorage.setItem(lsKey(LS_LAST_SUBMIT_KEY), String(now));

    markDirty();
  }

  // ensure voices loaded on some browsers
  const voicesLoadedOnce = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    if (voicesLoadedOnce.current) return;
    voicesLoadedOnce.current = true;

    try {
      synth.getVoices();
      synth.onvoiceschanged = () => {
        try {
          synth.getVoices();
        } catch {}
      };
    } catch {}
  }, []);

  // group questions by word for UX
  const quizByWord = useMemo(() => {
    const map = new Map<string, { wordId: string; word: string; questions: QuizQuestion[] }>();
    for (const q of quizQuestions) {
      const item = map.get(q.wordId);
      if (!item) map.set(q.wordId, { wordId: q.wordId, word: q.word, questions: [q] });
      else item.questions.push(q);
    }
    // stable order follows storedWords
    const ordered = storedWords
      .map((w) => map.get(w.id))
      .filter(Boolean) as Array<{ wordId: string; word: string; questions: QuizQuestion[] }>;
    ordered.forEach((it) => {
      it.questions = it.questions.slice();
    });
    return ordered;
  }, [quizQuestions, storedWords]);

  // ✅ Progress line: total words / done words (done = selected all POS for that word)
  const practiceProgress = useMemo(() => {
    if (!quizStarted) return null;
    const total = quizByWord.length;
    const done = quizByWord.filter((it) => it.questions.length > 0 && it.questions.every((q) => q.selectedIndex != null)).length;
    return { done, total };
  }, [quizStarted, quizByWord]);

  // ---------- UI ----------
  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={styles.h1}>My Vocabulary / Kho từ vựng</h1>
          <p style={styles.sub}>
            Tự thêm từ – tự ôn luyện – hệ thống ghi nhận điểm.
            {loadingServer ? (
              <span style={{ marginLeft: 8, opacity: 0.8 }}>• Đang tải từ server…</span>
            ) : (
              <span style={{ marginLeft: 8, opacity: 0.8 }}>• Synced ✓</span>
            )}
          </p>
        </div>

        <div style={styles.btnRow}>
          <Link href="/app" style={styles.btn as any}>
            ← Back / Quay lại
          </Link>
        </div>
      </div>

      {/* A) Add single word */}
      <div style={styles.card}>
        <div style={styles.titleRow}>
          <div style={styles.cardTitle}>Add to My Vocabulary / Thêm vào kho từ vựng</div>
          <div style={styles.pill}>Supabase</div>
        </div>

        <div style={styles.rowTop}>
          <input
            style={{ ...styles.input, flex: 1, minWidth: 280 }}
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="Nhập từ tiếng Anh (vd: match)"
          />

          <button style={styles.btn} onClick={addPosRow}>
            + Thêm POS
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {addRows.map((r, idx) => (
            <div key={r.id} style={styles.rowTop}>
              <select
                style={styles.select}
                value={r.pos}
                onChange={(e) => updateAddRow(r.id, { pos: e.target.value as PosKey })}
                aria-label={`POS row ${idx + 1}`}
              >
                <option value="verb">{posLabel("verb")}</option>
                <option value="noun">{posLabel("noun")}</option>
                <option value="adj">{posLabel("adj")}</option>
                <option value="adv">{posLabel("adv")}</option>
                <option value="prep">{posLabel("prep")}</option>
                <option value="pron">{posLabel("pron")}</option>
                <option value="det">{posLabel("det")}</option>
                <option value="conj">{posLabel("conj")}</option>
                <option value="interj">{posLabel("interj")}</option>
                <option value="phrase">{posLabel("phrase")}</option>
                <option value="other">{posLabel("other")}</option>
              </select>

              <input
                style={{ ...styles.input, flex: 1, minWidth: 260 }}
                value={r.meaning_vi}
                onChange={(e) => updateAddRow(r.id, { meaning_vi: e.target.value })}
                placeholder="Nhập nghĩa tiếng Việt (vd: làm cho phù hợp)"
              />

              <button
                style={{ ...styles.btnDanger, opacity: addRows.length <= 1 ? 0.45 : 1 }}
                onClick={() => removePosRow(r.id)}
                disabled={addRows.length <= 1}
                title={addRows.length <= 1 ? "Phải có ít nhất 1 POS" : "Xóa dòng POS này"}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div style={styles.btnRow}>
          <button style={styles.btnPrimary} onClick={addToVocabulary}>
            Add to / Thêm vào →
          </button>
        </div>

        <div style={styles.tiny}>
          Gợi ý: Nếu từ đã tồn tại và trùng POS, LIP sẽ <b>cộng dồn nghĩa</b> (vd: <i>que diêm, trận đấu</i>) thay vì overwrite.
        </div>

        {!userId ? <div style={styles.muted}>⚠️ Bạn chưa đăng nhập (không sync được).</div> : null}
      </div>

      {/* B) Vocabulary list */}
      <div style={styles.card}>
        <div style={styles.titleRow}>
          <div style={styles.cardTitle}>Từ đã có trong kho (synced)</div>
          <div style={styles.pill}>
            <b>Tổng số từ:</b> {totalWords} &nbsp;•&nbsp; <b>Đã ghi nhớ:</b> {masteredWords}
          </div>
        </div>

        {storedWords.length === 0 ? (
          <div style={styles.muted}>Bạn chưa có từ nào. Hãy thêm từ ở phần trên.</div>
        ) : (
          <div style={styles.listWrap}>
            {storedWords.map((w) => {
              const isOpen = openWordId === w.id;
              const isEditing = editWordId === w.id;
              const mastered = mastery[w.id]?.mastered === true;

              return (
                <div
                  key={w.id}
                  style={styles.wordRow}
                  onClick={() => {
                    if (isEditing) return; // avoid collapse while editing
                    openWord(w.id);
                  }}
                >
                  <div style={styles.wordRowTop}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={styles.wordTitle}>
                        {w.word}{" "}
                        {mastered ? <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.9 }}>✅ Đã ghi nhớ</span> : null}
                      </div>
                      <div style={styles.tiny}>(POS: {w.senses.length})</div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={styles.chevron}>{isOpen ? "Hide / Ẩn ▾" : "Open / Mở ▸"}</div>
                    </div>
                  </div>

                  {isOpen ? (
                    <>
                      <div style={styles.hr} />

                      {!isEditing ? (
                        <>
                          <div style={styles.rowTop} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                              <div style={styles.tiny}>Speak accent:</div>

                              <button style={styles.btn} onClick={() => speakWord(w.word, "en-US")}>
                                🔊 US
                              </button>
                              <button style={styles.btn} onClick={() => speakWord(w.word, "en-GB")}>
                                🔊 UK
                              </button>

                              <button style={styles.btnPrimary} onClick={() => startEdit(w.id)}>
                                Edit / Sửa →
                              </button>

                              <button style={styles.btnDanger} onClick={() => removeWord(w.id)}>
                                Remove / Xóa
                              </button>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {w.senses.map((s) => (
                              <div key={s.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                                <div style={{ ...styles.chip, cursor: "default" }}>{posLabel(s.pos)}</div>
                                <div style={{ fontSize: 12, opacity: 0.9 }}>{s.meaning_vi}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={styles.muted}>Sửa loại từ + nghĩa. (Nếu bạn xóa hết nghĩa thì không cho lưu.)</div>

                          {editSenses.map((s) => (
                            <div key={s.id} style={styles.rowTop}>
                              <select
                                style={styles.select}
                                value={s.pos}
                                onChange={(e) => updateEditSense(s.id, { pos: e.target.value as PosKey })}
                                aria-label="Edit POS"
                              >
                                <option value="verb">{posLabel("verb")}</option>
                                <option value="noun">{posLabel("noun")}</option>
                                <option value="adj">{posLabel("adj")}</option>
                                <option value="adv">{posLabel("adv")}</option>
                                <option value="prep">{posLabel("prep")}</option>
                                <option value="pron">{posLabel("pron")}</option>
                                <option value="det">{posLabel("det")}</option>
                                <option value="conj">{posLabel("conj")}</option>
                                <option value="interj">{posLabel("interj")}</option>
                                <option value="phrase">{posLabel("phrase")}</option>
                                <option value="other">{posLabel("other")}</option>
                              </select>

                              <input
                                style={{ ...styles.input, flex: 1, minWidth: 260 }}
                                value={s.meaning_vi}
                                onChange={(e) => updateEditSense(s.id, { meaning_vi: e.target.value })}
                                placeholder="Nghĩa tiếng Việt (có thể nhập: nghĩa 1, nghĩa 2)"
                              />

                              <button style={styles.btnDanger} onClick={() => removeEditSense(s.id)}>
                                Remove sense
                              </button>
                            </div>
                          ))}

                          <div style={styles.btnRow}>
                            <button style={styles.btn} onClick={addSenseEditRow}>
                              + Add POS
                            </button>
                            <button style={styles.btnPrimary} onClick={() => saveEdit(w.id)}>
                              Save / Lưu →
                            </button>
                            <button style={styles.btn} onClick={cancelEdit}>
                              Cancel / Hủy
                            </button>
                          </div>
                        </div>
                      )}

                      <div style={styles.tiny}>
                        Nguồn phát âm: <b>Web Speech API</b> của trình duyệt (speechSynthesis) — phụ thuộc voice có sẵn trên máy học sinh.
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* C) Practice */}
      <div style={styles.card}>
        <div style={styles.titleRow}>
          <div style={styles.cardTitle}>Vocabulary Practice / Ôn luyện từ vựng</div>
          <div style={styles.pill}>24h graded</div>
        </div>

        <div style={styles.muted}>
          - Bạn có thể <b>làm lại ngay</b> để luyện tập.<br />
          - Hệ thống chỉ <b>chấm điểm & lưu</b> tối đa <b>1 lần / 24h</b> để tránh cheat.<br />- Câu bỏ trống tính sai.
        </div>

        <div style={styles.rowTop}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
            <div style={styles.tiny}>Accent / Giọng đọc (Web Speech API)</div>
            <div style={styles.row}>
              <label style={{ ...styles.chip, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="accent"
                  checked={accent === "en-US"}
                  onChange={() => setAccent("en-US")}
                  style={{ margin: 0 }}
                />
                US (Mỹ)
              </label>

              <label style={{ ...styles.chip, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="accent"
                  checked={accent === "en-GB"}
                  onChange={() => setAccent("en-GB")}
                  style={{ margin: 0 }}
                />
                UK (Anh)
              </label>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={styles.tiny}>Your vocabulary / Kho từ</div>
            <div style={styles.muted}>
              Total words: <b>{totalWords}</b> • Total quiz items (by POS): <b>{totalQuizItems}</b>
            </div>
          </div>
        </div>

        <div style={styles.tiny}>
          Nguồn phát âm: <b>speechSynthesis</b> (Web Speech API). Accent US/UK phụ thuộc voice khả dụng trên thiết bị.
        </div>

        {cooldownLeftMs > 0 ? (
          <div style={styles.muted}>
            ⏳ Lần <b>chấm điểm & lưu</b> tiếp theo sau: <b>{cooldownText}</b> (bạn vẫn có thể luyện tập ngay).
          </div>
        ) : (
          <div style={styles.muted}>✅ Hiện tại <b>có thể chấm điểm & lưu</b> cho lần nộp bài này.</div>
        )}

        <div style={styles.btnRow}>
          <button style={{ ...styles.btnPrimary, opacity: canStartQuiz ? 1 : 0.5 }} onClick={startQuiz} disabled={!canStartQuiz}>
            Start / Bắt đầu →
          </button>

          <button
            style={{ ...styles.btn, opacity: quizStarted && !quizSubmitted ? 1 : 0.5 }}
            onClick={submitQuiz}
            disabled={!quizStarted || quizSubmitted}
          >
            Submit / Nộp bài →
          </button>
        </div>

        {/* ✅ New: progress line (exactly under Start/Submit) */}
        {practiceProgress ? (
          <div style={styles.tiny}>
            Tiến độ lượt này: <b>{practiceProgress.done}</b>/<b>{practiceProgress.total}</b> từ đã làm (đã chọn đủ tất cả POS).
          </div>
        ) : null}

        {quizResult ? (
          <div style={styles.muted}>
            Kết quả: <b>{quizResult.correct}</b>/<b>{quizResult.total}</b> câu đúng. &nbsp;•&nbsp;{" "}
            {quizSubmitted ? (
              isGradedAttempt ? (
                <>
                  <b>Đã lưu ✓</b> &nbsp;•&nbsp; Đã ghi nhớ: <b>{masteredWords}</b>/<b>{totalWords}</b> từ.
                </>
              ) : (
                <>
                  <b>Chỉ luyện tập (không lưu)</b> &nbsp;•&nbsp; Bạn có thể bấm <b>Start</b> để làm lại ngay.
                </>
              )
            ) : null}
          </div>
        ) : null}

        {quizStarted ? <div style={styles.hr} /> : null}

        {!quizStarted ? (
          <div style={styles.tiny} ref={practiceRef}>
            Bấm <b>Start</b> để tạo đề. LIP sẽ cuộn xuống phần ôn luyện để hạn chế “nhìn nhầm” kho từ.
          </div>
        ) : (
          <div ref={practiceRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {quizByWord.map((it) => {
              const wordMasteredNow = quizSubmitted && it.questions.length > 0 && it.questions.every((q) => q.isCorrect === true);

              return (
                <div key={it.wordId} style={styles.qaBlock}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 950, fontSize: 14 }}>
                        {it.word}{" "}
                        {quizSubmitted ? (wordMasteredNow ? <span style={{ marginLeft: 8 }}>✅</span> : <span style={{ marginLeft: 8 }}>❌</span>) : null}
                      </div>

                      <button style={styles.chip} onClick={() => speakWord(it.word, accent)} title="Speak">
                        🔊 Speak
                      </button>

                      {it.questions.map((q) => {
                        const key = `${q.wordId}:${q.senseId}`;
                        const isOpen = openQKey === key;

                        // keep suffix only after submit (so it won't be confused with active state)
                        const chipSuffix = quizSubmitted && q.isCorrect != null ? (q.isCorrect ? "✅" : "❌") : "";

                        // ✅ UX fix: active chip keeps clear border + ring highlight (no ✅, no ❌)
                        const chipStyle: React.CSSProperties = isOpen
                          ? {
                              ...styles.chip,
                              border: "2px solid rgba(255,255,255,0.55)",
                              background: "rgba(255,255,255,0.10)",
                              boxShadow: "0 0 0 3px rgba(255,255,255,0.06)",
                              fontWeight: 950,
                            }
                          : {
                              ...styles.chip,
                              border: "1px solid var(--border)",
                              background: "rgba(255,255,255,0.04)",
                              boxShadow: "none",
                            };

                        return (
                          <div
                            key={q.senseId}
                            style={chipStyle}
                            onClick={() => setOpenQKey((prev) => (prev === key ? null : key))}
                            title="Open quiz for this POS"
                          >
                            {posLabel(q.pos)}
                            {chipSuffix ? <span style={{ marginLeft: 6 }}>{chipSuffix}</span> : null}
                          </div>
                        );
                      })}
                    </div>

                    <button style={styles.btn} onClick={() => setOpenQKey(null)}>
                      Close all / Đóng →
                    </button>
                  </div>

                  {it.questions.map((q) => {
                    const key = `${q.wordId}:${q.senseId}`;
                    const isOpen = openQKey === key;
                    if (!isOpen) return null;

                    return (
                      <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={styles.tiny}>
                          Chọn nghĩa đúng (A–D). <b>Chỉ chấm sau khi Submit</b>.
                        </div>

                        {q.choices.map((c, idx) => {
                          const letter = String.fromCharCode(65 + idx);
                          const selected = q.selectedIndex === idx;

                          const afterSubmit = quizSubmitted;
                          const isCorrectChoice = afterSubmit && idx === q.correctIndex;
                          const isWrongSelected = afterSubmit && selected && idx !== q.correctIndex;

                          return (
                            <label
                              key={idx}
                              style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "flex-start",
                                borderRadius: 12,
                                border: isCorrectChoice
                                  ? "1px solid rgba(120,255,190,0.55)"
                                  : isWrongSelected
                                  ? "1px solid rgba(255,120,120,0.55)"
                                  : "1px solid var(--border)",
                                background: isCorrectChoice
                                  ? "rgba(120,255,190,0.10)"
                                  : isWrongSelected
                                  ? "rgba(255,120,120,0.10)"
                                  : "rgba(255,255,255,0.03)",
                                padding: "10px 12px",
                                cursor: quizSubmitted ? "default" : "pointer",
                                userSelect: "none",
                              }}
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={selected}
                                disabled={quizSubmitted}
                                onChange={() => selectAnswer(q.id, idx)}
                                style={{ marginTop: 2 }}
                              />
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ fontWeight: 950, fontSize: 12 }}>
                                  {letter}. {c}
                                </div>
                                {quizSubmitted && isCorrectChoice ? <div style={styles.tiny}>✅ Correct</div> : null}
                                {quizSubmitted && isWrongSelected ? <div style={styles.tiny}>❌ Wrong</div> : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
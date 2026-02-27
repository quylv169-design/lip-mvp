// app/components/StudentDashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
};

type TutorRow = {
  id: string;
  full_name: string | null;
};

type ClassRow = {
  id: string;
  name: string;
  tutor_id: string;
  join_code: string | null;
  created_at?: string | null;
};

type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  order_index: number;
  slide_path?: string | null;
  slide_updated_at?: string | null;
  created_at?: string | null;
};

type AttemptRow = {
  id: string;
  lesson_id: string;
  class_id: string;
  student_id: string;
  created_at: string;

  total_score: number | null;
  quiz_score?: number | null;
  questions_score?: number | null;

  notebook_image_urls?: string[] | null;
  ai_feedback?: any;
};

type PracticeAttemptRow = {
  id: string;
  lesson_id: string;
  student_id: string;
  correct_count: number | null;
  total_count: number | null;
  pct: number | null;
  created_at: string;
};

type ClassVM = {
  id: string;
  name: string;
  tutorName: string;
  joinCode: string | null;
  scheduleText: string; // MVP placeholder
};

type LessonVM = {
  id: string;
  title: string; // cleaned title
  rawTitle: string; // original from DB (for debugging if needed)
  order: number;

  slidePath: string | null;
  slideUpdatedAt: string | null;

  prelearningDone: boolean;
  practiceDone: boolean;

  prelearningScore: number | null;
  prelearningCreatedAt?: string;

  practiceCorrect: number | null;
  practiceTotal: number | null;
  practicePct: number | null;
  practiceCreatedAt?: string;

  latestAttempt?: AttemptRow | null;
};

type LessonTab = "materials" | "prelearning" | "practice";

function safeDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

/**
 * Parse schedule string like: "20:00 • T3, T5, T7"
 * dow: 0=Sun(CN),1=Mon(T2)...6=Sat(T7)
 */
function parseSchedule(scheduleText: string): { hour: number; minute: number; dowSet: Set<number> } | null {
  const t = (scheduleText || "").trim();
  if (!t) return null;

  const timeMatch = t.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!timeMatch) return null;

  const hour = Math.max(0, Math.min(23, Number(timeMatch[1])));
  const minute = Math.max(0, Math.min(59, Number(timeMatch[2])));

  const dowSet = new Set<number>();

  // Accept: "T3, T5, T7" and "CN"
  const raw = t.replace(/•/g, " ");
  const parts = raw.split(/[,]/).map((x) => x.trim().toUpperCase());

  for (const p of parts) {
    const m = p.match(/T\s*([2-7])/);
    if (m) {
      const d = Number(m[1]); // 2..7
      dowSet.add(d - 1); // T2->1 (Mon), ... T7->6 (Sat)
      continue;
    }
    if (p.includes("CN") || p.includes("CHU NHAT") || p.includes("CHỦ NHẬT")) {
      dowSet.add(0); // Sunday
      continue;
    }
  }

  // fallback: if missing days, assume everyday (avoid crash)
  if (dowSet.size === 0) for (let i = 0; i < 7; i++) dowSet.add(i);

  return { hour, minute, dowSet };
}

function getNextClassStart(scheduleText: string, now: Date): Date | null {
  const parsed = parseSchedule(scheduleText);
  if (!parsed) return null;

  const { hour, minute, dowSet } = parsed;
  const base = new Date(now.getTime());

  for (let add = 0; add < 14; add++) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + add);
    d.setHours(hour, minute, 0, 0);

    if (!dowSet.has(d.getDay())) continue;
    if (d.getTime() <= now.getTime()) continue;

    return d;
  }
  return null;
}

function guessNameFromEmail(email?: string | null) {
  const e = String(email ?? "").trim();
  if (!e) return "";
  const local = e.split("@")[0] ?? "";
  return local.trim();
}

/** Fix "Lesson 1: Lesson 1: Present Simple" by removing a leading "Lesson N:" from DB title */
function stripLeadingLessonPrefix(title: string) {
  const t = String(title ?? "").trim();
  // remove one-or-more leading "Lesson N:" blocks
  return t.replace(/^(?:lesson\s*\d+\s*:\s*)+/i, "").trim();
}

function formatPracticeScore(correct: number | null, total: number | null, pct: number | null) {
  if (typeof correct !== "number" || typeof total !== "number" || total <= 0) return "";
  const pctText = typeof pct === "number" ? ` ~ ${pct}%` : "";
  return `${correct}/${total}${pctText}`;
}

function normalizeJoinCode(input: string) {
  return String(input || "").trim().toUpperCase();
}

function mapJoinRpcErrorMessage(errMsg: string) {
  const m = String(errMsg || "");
  // Supabase thường bọc message kiểu: "JOIN_CODE_NOT_FOUND" hoặc "...: JOIN_CODE_NOT_FOUND"
  if (m.includes("JOIN_CODE_NOT_FOUND")) return "Join code không đúng hoặc lớp không tồn tại.";
  if (m.includes("CLASS_FULL")) return "Lớp đã đủ học sinh (tối đa 2).";
  return "";
}

export default function StudentDashboard() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [err, setErr] = useState("");

  const [userId, setUserId] = useState("");
  const [userMetaName, setUserMetaName] = useState<string>("");
  const [userEmailName, setUserEmailName] = useState<string>("");
  const [me, setMe] = useState<ProfileRow | null>(null);

  const [classes, setClasses] = useState<ClassVM[]>([]);
  const [activeClassId, setActiveClassId] = useState("");

  const [lessons, setLessons] = useState<LessonVM[]>([]);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessonTab, setLessonTab] = useState<LessonTab>("prelearning");

  // Prelearning details modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLesson, setDetailLesson] = useState<LessonVM | null>(null);

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState("");

  // Slide modal
  const [slideOpen, setSlideOpen] = useState(false);
  const [slideLesson, setSlideLesson] = useState<LessonVM | null>(null);
  const [slideLoading, setSlideLoading] = useState(false);
  const [slideErr, setSlideErr] = useState("");
  const [slideUrl, setSlideUrl] = useState<string>("");

  // ✅ Fullscreen for slide modal
  const slideFrameWrapRef = useRef<HTMLDivElement | null>(null);
  const [slideIsFullscreen, setSlideIsFullscreen] = useState(false);

  // Vocabulary snapshot (MVP placeholder)
  const [vocabTotal] = useState(0);
  const [vocabMasteredPct] = useState(0);

  // Join class by code (MVP)
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  // Countdown ticker
  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // --- Fullscreen helpers ---
  function getFullscreenElement(): Element | null {
    const d: any = document as any;
    return (document.fullscreenElement ||
      d.webkitFullscreenElement ||
      d.mozFullScreenElement ||
      d.msFullscreenElement ||
      null) as Element | null;
  }

  async function requestFullscreenForSlide() {
    const el = slideFrameWrapRef.current as any;
    if (!el) return;

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        return;
      }
      if (el.webkitRequestFullscreen) {
        // Safari
        el.webkitRequestFullscreen();
        return;
      }
      if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
        return;
      }
      if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
        return;
      }

      // fallback
      if (slideUrl) window.open(slideUrl, "_blank", "noopener,noreferrer");
    } catch {
      // fallback (some browsers block programmatic fullscreen)
      if (slideUrl) window.open(slideUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function exitFullscreen() {
    try {
      const d: any = document as any;
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        return;
      }
      if (d.webkitExitFullscreen) {
        d.webkitExitFullscreen();
        return;
      }
      if (d.mozCancelFullScreen) {
        d.mozCancelFullScreen();
        return;
      }
      if (d.msExitFullscreen) {
        d.msExitFullscreen();
        return;
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const onFsChange = () => {
      const fsEl = getFullscreenElement();
      const wrap = slideFrameWrapRef.current;
      setSlideIsFullscreen(!!fsEl && !!wrap && fsEl === wrap);
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange" as any, onFsChange);
    document.addEventListener("mozfullscreenchange" as any, onFsChange);
    document.addEventListener("MSFullscreenChange" as any, onFsChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange" as any, onFsChange);
      document.removeEventListener("mozfullscreenchange" as any, onFsChange);
      document.removeEventListener("MSFullscreenChange" as any, onFsChange);
    };
  }, []);

  // If modal closed while fullscreen, auto exit
  useEffect(() => {
    if (!slideOpen && slideIsFullscreen) {
      exitFullscreen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideOpen]);

  async function fetchSlideSignedUrl(lessonId: string) {
    setSlideLoading(true);
    setSlideErr("");
    setSlideUrl("");

    try {
      const { data: auth } = await supabase.auth.getSession();
      const accessToken = auth.session?.access_token;
      if (!accessToken) {
        setSlideErr("Bạn đã đăng xuất. Vui lòng đăng nhập lại.");
        return;
      }

      const res = await fetch(`/api/lesson-slide-signed-url?lessonId=${encodeURIComponent(lessonId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const json = await res.json();
      if (!res.ok) {
        setSlideErr(json?.error || "Không lấy được signed URL");
        return;
      }

      if (!json?.url) {
        setSlideErr("API không trả về url.");
        return;
      }

      setSlideUrl(String(json.url));
    } catch (e: any) {
      setSlideErr(e?.message || "Lỗi không xác định");
    } finally {
      setSlideLoading(false);
    }
  }

  async function loadStudentDashboardState(opts?: { preferActiveClassId?: string }) {
    setBooting(true);
    setErr("");

    const { data: sessionRes } = await supabase.auth.getSession();
    const session = sessionRes.session;

    if (!session) {
      router.push("/login");
      return;
    }

    const uid = session.user.id;
    setUserId(uid);

    const meta: any = session.user.user_metadata ?? {};
    const metaName = String(meta.full_name || meta.name || meta.display_name || "").trim();
    setUserMetaName(metaName);

    const emailName = guessNameFromEmail(session.user.email ?? null);
    setUserEmailName(emailName);

    // ✅ HARD FIX: luôn cố lấy full_name từ profiles (không để fail làm UI fallback)
    try {
      const { data: meRow1, error: meErr1 } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url")
        .eq("id", uid)
        .maybeSingle();

      if (meErr1) {
        console.warn("[StudentDashboard] profiles select error (1):", meErr1);
      }

      const nameCandidate = String(meRow1?.full_name ?? "").trim();
      if (meRow1 && nameCandidate) {
        setMe((meRow1 as any) ?? null);
      } else {
        // thử tạo/đồng bộ profile (nếu policy cho phép)
        const fallbackName = (metaName || "").trim() || emailName || "Student";
        const { error: upsertErr } = await supabase.from("profiles").upsert(
          {
            id: uid,
            full_name: fallbackName,
            avatar_url: meRow1?.avatar_url ?? null,
          },
          { onConflict: "id" }
        );

        if (upsertErr) {
          console.warn("[StudentDashboard] profiles upsert error:", upsertErr);
        }

        const { data: meRow2, error: meErr2 } = await supabase
          .from("profiles")
          .select("id,full_name,avatar_url")
          .eq("id", uid)
          .maybeSingle();

        if (meErr2) {
          console.warn("[StudentDashboard] profiles select error (2):", meErr2);
        }

        setMe((meRow2 as any) ?? null);
      }
    } catch (e: any) {
      console.warn("[StudentDashboard] profiles fetch crash:", e);
      setMe(null);
    }

    const { data: memberships, error: memErr } = await supabase.from("class_members").select("class_id").eq("student_id", uid);

    if (memErr) {
      setErr(memErr.message);
      setClasses([]);
      setActiveClassId("");
      setLessons([]);
      setExpandedLessonId(null);
      setLessonTab("prelearning");
      setBooting(false);
      return;
    }

    const classIds = (memberships ?? []).map((m: any) => m.class_id);
    if (classIds.length === 0) {
      setClasses([]);
      setActiveClassId("");
      setLessons([]);
      setExpandedLessonId(null);
      setLessonTab("prelearning");
      setBooting(false);
      return;
    }

    const { data: classRows, error: classErr } = await supabase.from("classes").select("id,name,tutor_id,join_code,created_at").in("id", classIds);

    if (classErr) {
      setErr(classErr.message);
      setClasses([]);
      setActiveClassId("");
      setLessons([]);
      setExpandedLessonId(null);
      setLessonTab("prelearning");
      setBooting(false);
      return;
    }

    const tutorIds = Array.from(new Set((classRows ?? []).map((c: any) => c.tutor_id)));
    const { data: tutorRows, error: tutorErr } = await supabase.from("profiles").select("id,full_name").in("id", tutorIds);

    if (tutorErr) {
      setErr(tutorErr.message);
      setClasses([]);
      setActiveClassId("");
      setLessons([]);
      setExpandedLessonId(null);
      setLessonTab("prelearning");
      setBooting(false);
      return;
    }

    const tutorMap = new Map<string, string>();
    (tutorRows ?? []).forEach((t: TutorRow) => tutorMap.set(t.id, t.full_name ?? "Tutor"));

    const vms: ClassVM[] = (classRows ?? [])
      .sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      .map((c: ClassRow) => ({
        id: c.id,
        name: c.name,
        tutorName: tutorMap.get(c.tutor_id) ?? "Tutor",
        joinCode: c.join_code,
        scheduleText: "20:00 • T3, T5, T7", // MVP placeholder
      }));

    setClasses(vms);

    const prefer = String(opts?.preferActiveClassId ?? "").trim();
    const nextActive = prefer && vms.some((x) => x.id === prefer) ? prefer : vms[0]?.id || "";
    setActiveClassId(nextActive);

    setBooting(false);
  }

  // ----- AUTH + LOAD CLASSES -----
  useEffect(() => {
    (async () => {
      await loadStudentDashboardState();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ----- LOAD LESSONS + LATEST PRELEARNING + LATEST PRACTICE -----
  useEffect(() => {
    (async () => {
      if (!activeClassId || !userId) return;

      setErr("");

      const { data: lessonRows, error: lessonErr } = await supabase
        .from("lessons")
        .select("id,class_id,title,order_index,slide_path,slide_updated_at,created_at")
        .eq("class_id", activeClassId)
        .order("order_index", { ascending: true });

      if (lessonErr) {
        setErr(lessonErr.message);
        setLessons([]);
        setExpandedLessonId(null);
        return;
      }

      const lessonList = ((lessonRows as LessonRow[]) ?? []).map((l) => ({
        ...l,
        title: String(l.title ?? ""),
        slide_path: (l as any).slide_path ?? null,
        slide_updated_at: (l as any).slide_updated_at ?? null,
      }));

      const lessonIds = lessonList.map((l) => l.id);

      // Prelearning attempts (latest per lesson)
      const { data: attemptRows, error: attemptErr } = await supabase
        .from("prelearning_attempts")
        .select("id,lesson_id,class_id,student_id,created_at,total_score,notebook_image_urls,ai_feedback,quiz_score,questions_score")
        .eq("class_id", activeClassId)
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(300);

      if (attemptErr) setErr(attemptErr.message);

      const latestPreByLesson = new Map<string, AttemptRow>();
      (attemptRows as any[] | null)?.forEach((a) => {
        const lid = String(a.lesson_id);
        if (!latestPreByLesson.has(lid)) latestPreByLesson.set(lid, a as AttemptRow);
      });

      // ✅ Practice attempts (latest per lesson)
      // NOTE: practice_attempts has NO class_id column, so filter by student + lessonIds
      let practiceRows: PracticeAttemptRow[] = [];
      if (lessonIds.length > 0) {
        const { data: pracRows, error: pracErr } = await supabase
          .from("practice_attempts")
          .select("id,lesson_id,student_id,correct_count,total_count,pct,created_at")
          .eq("student_id", userId)
          .in("lesson_id", lessonIds)
          .order("created_at", { ascending: false })
          .limit(500);

        if (pracErr) {
          console.warn("[StudentDashboard] practice_attempts select error:", pracErr);
          // không setErr cứng để tránh phá UI
        } else {
          practiceRows = (pracRows as any) ?? [];
        }
      }

      const latestPracticeByLesson = new Map<string, PracticeAttemptRow>();
      practiceRows.forEach((r) => {
        const lid = String(r.lesson_id);
        if (!latestPracticeByLesson.has(lid)) latestPracticeByLesson.set(lid, r);
      });

      const lessonVMs: LessonVM[] = lessonList.map((l) => {
        const latestPre = latestPreByLesson.get(l.id) ?? null;
        const latestPrac = latestPracticeByLesson.get(l.id) ?? null;

        const cleanedTitle = stripLeadingLessonPrefix(l.title);

        return {
          id: l.id,
          rawTitle: l.title,
          title: cleanedTitle || l.title,
          order: l.order_index,

          slidePath: (l.slide_path as any) ?? null,
          slideUpdatedAt: (l.slide_updated_at as any) ?? null,

          prelearningDone: !!latestPre,
          practiceDone: !!latestPrac,

          prelearningScore: latestPre?.total_score ?? null,
          prelearningCreatedAt: latestPre?.created_at,

          practiceCorrect: latestPrac?.correct_count ?? null,
          practiceTotal: latestPrac?.total_count ?? null,
          practicePct: latestPrac?.pct ?? null,
          practiceCreatedAt: latestPrac?.created_at,

          latestAttempt: latestPre,
        };
      });

      setLessons(lessonVMs);
      setExpandedLessonId((prev) => (prev && lessonVMs.some((x) => x.id === prev) ? prev : null));
    })();
  }, [activeClassId, userId]);

  const activeClass = useMemo(() => classes.find((c) => c.id === activeClassId) ?? null, [classes, activeClassId]);

  const countdownVM = useMemo(() => {
    if (!activeClass) return null;
    const nextStart = getNextClassStart(activeClass.scheduleText, nowTick);
    if (!nextStart) return null;

    const deadline = new Date(nextStart.getTime() - 2 * 60 * 60 * 1000);
    const msLeft = deadline.getTime() - nowTick.getTime();

    return {
      nextStart,
      deadline,
      msLeft,
      leftText: msLeft > 0 ? formatDuration(msLeft) : "00:00:00",
      isLate: msLeft <= 0,
    };
  }, [activeClass, nowTick]);

  // ✅ FIX: ƯU TIÊN full_name trong profiles, nếu chưa có thì dùng user_metadata, cuối cùng mới "Student"
  // (KHÔNG hiển thị email nữa)
  const displayName = useMemo(() => {
    const a = (me?.full_name ?? "").trim();
    if (a) return a;

    const b = (userMetaName ?? "").trim();
    if (b) return b;

    return "Student";
  }, [me?.full_name, userMetaName]);

  const profileSummary = useMemo(() => {
    const total = lessons.length;
    const done = lessons.filter((l) => l.prelearningDone).length;
    const scores = lessons.map((l) => l.prelearningScore).filter((x) => typeof x === "number") as number[];
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

    if (total === 0) {
      return {
        title: "Bạn đang khởi động rất tốt 💪",
        lines: ["Hiện lớp chưa có lesson để học.", "Khi tutor tạo lesson, bạn sẽ thấy danh sách Lesson 1..N ở cột Lessons."],
      };
    }
    if (done === 0) {
      return {
        title: "Bắt đầu đúng hướng rồi đó ✨",
        lines: ["Tiếp theo: chọn Lesson 1 → Prelearning Activities.", "Mẹo: ghi vở sạch/đủ ý + làm quiz kỹ sẽ tăng điểm rất nhanh."],
      };
    }
    return {
      title: "Tiến bộ đang lên rồi 🚀",
      lines: [
        `Bạn đã hoàn thành prelearning: ${done}/${total} lesson.`,
        avg != null ? `Điểm prelearning trung bình: ~ ${avg}/10.` : "Chưa đủ dữ liệu điểm trung bình.",
        "Điểm mạnh: bạn đang duy trì nhịp học.",
        "Gợi ý: làm đều (đừng dồn), và ghi vở rõ ràng để feedback chuẩn hơn.",
      ],
    };
  }, [lessons]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ✅ FIX: Join class via RPC (SECURITY DEFINER) to avoid RLS blocking select/insert
  async function joinClassByCode() {
    const code = normalizeJoinCode(joinCodeInput);
    setJoinMsg(null);

    if (!code) {
      setJoinMsg("Vui lòng nhập join code.");
      return;
    }
    if (!userId) {
      setJoinMsg("Chưa xác định được user. Vui lòng reload trang.");
      return;
    }

    setJoinLoading(true);

    try {
      // Important: RPC function name must exist in Supabase:
      // public.join_class_by_code(p_join_code text) returns uuid
      const { data, error } = await supabase.rpc("join_class_by_code", { p_join_code: code });

      if (error) {
        const friendly = mapJoinRpcErrorMessage(error.message);
        setJoinMsg(friendly || error.message || "Không join được lớp.");
        return;
      }

      const classId = String(data || "").trim();
      if (!classId) {
        setJoinMsg("Không nhận được class_id từ server. Vui lòng thử lại.");
        return;
      }

      setJoinMsg("✅ Join lớp thành công!");
      setJoinCodeInput("");

      // Reload + focus new class
      await loadStudentDashboardState({ preferActiveClassId: classId });
      setActiveClassId(classId);
      setExpandedLessonId(null);
      setLessonTab("prelearning");
    } catch (e: any) {
      setJoinMsg(e?.message || "Lỗi không xác định khi join lớp.");
    } finally {
      setJoinLoading(false);
    }
  }

  // ---------- STYLES ----------
  const styles: Record<string, React.CSSProperties> = {
    page: {
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      color: "var(--lip-text, rgba(255,255,255,0.92))",
    },
    topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
    title: { fontSize: 18, fontWeight: 950, letterSpacing: 0.2 },
    subtitle: { fontSize: 12, opacity: 0.72 },
    row: { display: "flex", gap: 10, alignItems: "center" },
    select: {
      height: 36,
      borderRadius: 12,
      border: "1px solid var(--lip-border-strong, rgba(255,255,255,0.18))",
      background: "var(--lip-surface-1, rgba(255,255,255,0.06))",
      color: "inherit",
      padding: "0 10px",
      fontWeight: 900,
      fontSize: 12,
      cursor: "pointer",
      outline: "none",
    },
    input: {
      height: 40,
      borderRadius: 12,
      border: "1px solid var(--lip-border-strong, rgba(255,255,255,0.18))",
      background: "var(--lip-surface-1, rgba(255,255,255,0.06))",
      color: "inherit",
      padding: "0 12px",
      fontWeight: 900,
      fontSize: 12,
      outline: "none",
      width: "100%",
    },
    grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
    col: {
      borderRadius: 18,
      border: "1px solid var(--lip-border, rgba(255,255,255,0.12))",
      background: "var(--lip-surface-0, rgba(255,255,255,0.04))",
      padding: 14,
      minHeight: 540,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      overflow: "hidden",
      boxShadow: "var(--lip-shadow, 0 10px 30px rgba(0,0,0,0.18))",
    },
    colHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingBottom: 10,
      borderBottom: "1px solid var(--lip-divider, rgba(255,255,255,0.08))",
    },
    colTitle: { fontSize: 13, fontWeight: 950, letterSpacing: 0.2 },
    pill: {
      fontSize: 11,
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid var(--lip-border, rgba(255,255,255,0.14))",
      background: "var(--lip-surface-1, rgba(255,255,255,0.06))",
      opacity: 0.92,
      whiteSpace: "nowrap",
    },

    legendRow: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, opacity: 0.85 },
    legendRight: { display: "flex", gap: 12, alignItems: "center" },
    legendCol: { fontWeight: 950, opacity: 0.92 },

    list: { display: "flex", flexDirection: "column", gap: 10, overflow: "auto", paddingRight: 6 },
    muted: { fontSize: 12, opacity: 0.78, lineHeight: 1.6 },
    tiny: { fontSize: 11, opacity: 0.68, lineHeight: 1.5 },
    divider: { height: 1, background: "var(--lip-divider, rgba(255,255,255,0.08))", width: "100%" },
    chevron: { opacity: 0.6, fontWeight: 950 },
    expandPanel: {
      borderRadius: 14,
      border: "1px solid var(--lip-border, rgba(255,255,255,0.14))",
      background: "var(--lip-surface-2, rgba(0,0,0,0.18))",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    btnRow: { display: "flex", gap: 10, flexWrap: "wrap" },
    btnPrimary: {
      borderRadius: 12,
      padding: "10px 12px",
      border: "1px solid var(--lip-border-strong, rgba(255,255,255,0.24))",
      background: "var(--lip-cta-bg, linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06)))",
      color: "inherit",
      cursor: "pointer",
      fontWeight: 950,
      fontSize: 12,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    },
    btn: {
      borderRadius: 12,
      padding: "10px 12px",
      border: "1px solid var(--lip-border, rgba(255,255,255,0.14))",
      background: "var(--lip-surface-1, rgba(255,255,255,0.06))",
      color: "inherit",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    },
    btnGhost: {
      borderRadius: 12,
      padding: "10px 12px",
      border: "1px solid var(--lip-border, rgba(255,255,255,0.12))",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
    },
    cardMini: {
      borderRadius: 14,
      border: "1px solid var(--lip-border, rgba(255,255,255,0.12))",
      background: "var(--lip-surface-0, rgba(255,255,255,0.03))",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    countdownCard: {
      borderRadius: 14,
      border: "1px solid var(--lip-border, rgba(255,255,255,0.14))",
      background: "var(--lip-surface-1, linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)))",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    },
    countdownBig: { fontSize: 22, fontWeight: 950, letterSpacing: 0.8 },
    warn: {
      borderRadius: 12,
      border: "1px solid var(--lip-warn-border, rgba(255,220,120,0.30))",
      background: "var(--lip-warn-bg, rgba(255,220,120,0.08))",
      padding: 10,
      fontSize: 12,
      lineHeight: 1.5,
      opacity: 0.95,
    },
    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "var(--lip-overlay, rgba(0,0,0,0.62))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      zIndex: 50,
    },
    modal: {
      width: "min(980px, 96vw)",
      maxHeight: "88vh",
      borderRadius: 18,
      border: "1px solid var(--lip-border, rgba(255,255,255,0.14))",
      background: "var(--lip-modal-bg, rgba(16,16,16,0.92))",
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      overflow: "hidden",
      boxShadow: "var(--lip-shadow-strong, 0 18px 60px rgba(0,0,0,0.35))",
    },
    gridImgs: {
      overflow: "auto",
      paddingRight: 6,
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 10,
    },
    imgThumb: {
      width: "100%",
      height: 130,
      borderRadius: 14,
      border: "1px solid var(--lip-border, rgba(255,255,255,0.12))",
      objectFit: "cover",
      background: "var(--lip-surface-0, rgba(255,255,255,0.02))",
      cursor: "pointer",
    },
  };

  function lessonRowStyle(active: boolean): React.CSSProperties {
    return {
      borderRadius: 14,
      border: active
        ? "1px solid var(--lip-border-strong, rgba(255,255,255,0.26))"
        : "1px solid var(--lip-border, rgba(255,255,255,0.12))",
      background: active ? "var(--lip-surface-2, rgba(255,255,255,0.08))" : "var(--lip-surface-0, rgba(255,255,255,0.03))",
      padding: 12,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      transition: "transform 120ms ease, background 120ms ease, border 120ms ease",
    };
  }

  function tickBadge(done: boolean): React.CSSProperties {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      fontWeight: 900,
      padding: "6px 10px",
      borderRadius: 999,
      border: done
        ? "1px solid var(--lip-success-border, rgba(120,255,190,0.45))"
        : "1px solid var(--lip-border, rgba(255,255,255,0.16))",
      background: done ? "var(--lip-success-bg, rgba(120,255,190,0.10))" : "var(--lip-surface-0, rgba(255,255,255,0.04))",
      color: done ? "var(--lip-success-text, rgba(220,255,240,0.95))" : "var(--lip-text-muted, rgba(255,255,255,0.78))",
      userSelect: "none",
      whiteSpace: "nowrap",
    };
  }

  function menuItem(active: boolean): React.CSSProperties {
    return {
      width: "100%",
      borderRadius: 12,
      padding: "11px 12px",
      border: active
        ? "1px solid var(--lip-border-strong, rgba(255,255,255,0.22))"
        : "1px solid var(--lip-border, rgba(255,255,255,0.12))",
      background: active ? "var(--lip-surface-2, rgba(255,255,255,0.08))" : "var(--lip-surface-0, rgba(255,255,255,0.03))",
      color: "inherit",
      cursor: "pointer",
      fontWeight: 950,
      fontSize: 12,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    };
  }

  if (booting) return <div style={{ padding: 20, opacity: 0.8 }}>Loading…</div>;
  if (err) return <div style={{ padding: 20, color: "var(--lip-error, #ffb4b4)" }}>Error: {err}</div>;

  return (
    <div style={styles.page}>
      {/* Topbar */}
      <div style={styles.topbar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={styles.title}>Student Dashboard</div>
          <div style={styles.subtitle}>{displayName ? `Hi, ${displayName}` : "Hi"} • Chọn lesson để học và theo dõi tiến bộ</div>
        </div>

        <div style={styles.row}>
          {classes.length > 0 ? (
            <select
              value={activeClassId}
              onChange={(e) => {
                setActiveClassId(e.target.value);
                setExpandedLessonId(null);
                setLessonTab("prelearning");
              }}
              style={styles.select}
              aria-label="Select class"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}

          <button onClick={logout} style={styles.btnGhost}>
            Logout
          </button>
        </div>
      </div>

      {/* 4 columns */}
      <div style={styles.grid} className="grid4">
        {/* Column 1: Lessons */}
        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.colTitle}>Lessons</div>
            <div style={styles.pill}>{lessons.length} lessons</div>
          </div>

          {/* Header row */}
          <div style={styles.legendRow}>
            <div style={{ opacity: 0.78 }}>Chọn lesson để mở menu</div>
            <div style={styles.legendRight}>
              <div style={{ fontWeight: 950, opacity: 0.92 }}>Prelearning</div>
              <div style={{ fontWeight: 950, opacity: 0.92 }}>Luyện tập</div>
            </div>
          </div>

          <div style={styles.list}>
            {lessons.length === 0 ? (
              <div style={styles.muted}>
                Chưa có lesson trong lớp này.
                <br />
                Tutor tạo lesson xong sẽ hiện ở đây.
              </div>
            ) : (
              lessons.map((l) => {
                const active = l.id === expandedLessonId;
                const pracScoreText = formatPracticeScore(l.practiceCorrect, l.practiceTotal, l.practicePct);

                return (
                  <div
                    key={l.id}
                    style={lessonRowStyle(active)}
                    onClick={() => setExpandedLessonId(active ? null : l.id)}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.transform = "translateY(0px)")}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                        Lesson {l.order}: {l.title}
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                        <div style={tickBadge(l.prelearningDone)}>
                          <span>{l.prelearningDone ? "✅" : "⬜"}</span>
                          <span>Pre</span>
                        </div>

                        <div style={tickBadge(l.practiceDone)}>
                          <span>{l.practiceDone ? "✅" : "⬜"}</span>
                          <span>Prac</span>
                          {l.practiceDone && pracScoreText ? <span style={{ opacity: 0.9, fontWeight: 950 }}>• {pracScoreText}</span> : null}
                        </div>
                      </div>
                    </div>

                    {active ? (
                      <div style={styles.expandPanel} onClick={(e) => e.stopPropagation()}>
                        <button style={menuItem(lessonTab === "materials")} onClick={() => setLessonTab("materials")}>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span>📚</span>
                            <span>Tài liệu học tập</span>
                          </span>
                          <span style={{ opacity: 0.6, fontWeight: 950 }}>›</span>
                        </button>

                        <button style={menuItem(lessonTab === "prelearning")} onClick={() => setLessonTab("prelearning")}>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span>✅</span>
                            <span>Prelearning Activities</span>
                          </span>
                          <span style={{ opacity: 0.6, fontWeight: 950 }}>›</span>
                        </button>

                        <button style={menuItem(lessonTab === "practice")} onClick={() => setLessonTab("practice")}>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span>🎯</span>
                            <span>Luyện tập</span>
                          </span>
                          <span style={{ opacity: 0.6, fontWeight: 950 }}>›</span>
                        </button>

                        <div style={styles.divider} />

                        {lessonTab === "materials" ? (
                          <div style={styles.cardMini}>
                            <div style={{ fontWeight: 950, fontSize: 13 }}>Slide bài giảng</div>

                            {!l.slidePath ? (
                              <div style={styles.muted}>
                                Lesson này chưa có slide.
                                <br />
                                (Admin upload slide xong sẽ hiện nút “Xem slide”.)
                              </div>
                            ) : (
                              <>
                                <div style={styles.tiny}>
                                  Updated: <span style={{ opacity: 0.9 }}>{l.slideUpdatedAt ? safeDate(l.slideUpdatedAt) : "-"}</span>
                                </div>

                                <div style={styles.btnRow}>
                                  <button
                                    style={styles.btnPrimary}
                                    onClick={async () => {
                                      setSlideLesson(l);
                                      setSlideOpen(true);
                                      await fetchSlideSignedUrl(l.id);
                                    }}
                                  >
                                    Xem slide →
                                  </button>
                                </div>

                                <div style={styles.tiny} title={l.slidePath}>
                                  slide_path: <span style={{ opacity: 0.85 }}>{l.slidePath}</span>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}

                        {lessonTab === "prelearning" ? (
                          <div style={styles.cardMini}>
                            <div style={{ fontWeight: 950, fontSize: 13 }}>Prelearning</div>

                            {l.prelearningDone ? (
                              <>
                                <div style={styles.muted}>
                                  Điểm gần nhất:{" "}
                                  <b style={{ opacity: 0.95 }}>{l.prelearningScore != null ? `${l.prelearningScore}/10` : "-"}</b>{" "}
                                  <span style={{ opacity: 0.65 }}>• {l.prelearningCreatedAt ? safeDate(l.prelearningCreatedAt) : ""}</span>
                                </div>

                                <div style={styles.btnRow}>
                                  <Link href={`/student/prelearning/${l.id}`} style={styles.btn as any}>
                                    Làm lại →
                                  </Link>

                                  <button
                                    style={styles.btnPrimary}
                                    onClick={() => {
                                      setDetailLesson(l);
                                      setDetailOpen(true);
                                    }}
                                  >
                                    Xem chi tiết →
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={styles.muted}>
                                  Bạn chưa làm prelearning cho lesson này.
                                  <br />
                                  Làm trước buổi học để tutor biết bạn đang mạnh/yếu chỗ nào.
                                </div>
                                <div style={styles.btnRow}>
                                  <Link href={`/student/prelearning/${l.id}`} style={styles.btnPrimary as any}>
                                    Bắt đầu →
                                  </Link>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}

                        {lessonTab === "practice" ? (
                          <div style={styles.cardMini}>
                            <div style={{ fontWeight: 950, fontSize: 13 }}>Luyện tập</div>

                            {l.practiceDone ? (
                              <div style={styles.muted}>
                                Điểm đã chốt (lần nộp đầu):{" "}
                                <b style={{ opacity: 0.95 }}>{formatPracticeScore(l.practiceCorrect, l.practiceTotal, l.practicePct) || "—"}</b>{" "}
                                <span style={{ opacity: 0.65 }}>• {l.practiceCreatedAt ? safeDate(l.practiceCreatedAt) : ""}</span>
                              </div>
                            ) : (
                              <div style={styles.muted}>
                                MVP: luyện tập sẽ có <b>điểm số</b> (không dùng % completion) để tránh “điền bừa”.
                                <br />
                                Sau khi nộp bài lần đầu, điểm sẽ được chốt để theo dõi tiến bộ.
                              </div>
                            )}

                            <div style={styles.btnRow}>
                              <Link href={`/student/practice?lessonId=${l.id}`} style={styles.btnPrimary as any}>
                                Đi tới luyện tập →
                              </Link>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ marginTop: "auto", ...styles.tiny }}>Gợi ý: tick Pre/Practice giúp bạn nhìn nhanh lesson nào đang thiếu bước nào.</div>
        </div>

        {/* Column 2: My classes */}
        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.colTitle}>My classes</div>
            <div style={styles.pill}>{classes.length} classes</div>
          </div>

          {/* ✅ Join class by code */}
          <div style={styles.cardMini}>
            <div style={{ fontWeight: 950, fontSize: 13 }}>Join class bằng code</div>
            <div style={styles.tiny}>Nhập code tutor cung cấp để vào lớp (ví dụ: ABC123).</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="Join code…"
                style={styles.input}
                disabled={joinLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") joinClassByCode();
                }}
                aria-label="Join code input"
              />
              <button style={styles.btnPrimary} onClick={joinClassByCode} disabled={joinLoading}>
                {joinLoading ? "Joining…" : "Join →"}
              </button>
            </div>

            {joinMsg ? (
              <div style={{ ...styles.tiny, color: joinMsg.startsWith("✅") ? "rgba(170,255,210,0.95)" : "var(--lip-error, #0F5132)" }}>
                {joinMsg}
              </div>
            ) : null}

            <div style={styles.tiny}>
              Nếu join bị lỗi “RLS”/“permission denied”: bạn chưa tạo RPC <b>join_class_by_code</b> (SECURITY DEFINER) ở DB.
            </div>
          </div>

          {/* Countdown T-2h */}
          <div style={styles.countdownCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 950, fontSize: 13 }}>⏳ Countdown (T-2h)</div>
              <div style={styles.tiny}>{activeClass?.scheduleText ?? "-"}</div>
            </div>

            {countdownVM ? (
              <>
                <div style={styles.tiny}>
                  Buổi học tiếp theo: <b style={{ opacity: 0.95 }}>{countdownVM.nextStart.toLocaleString()}</b>
                </div>

                <div style={styles.countdownBig}>{countdownVM.leftText}</div>

                {!countdownVM.isLate ? (
                  <div style={styles.warn}>
                    Hãy chắc chắn bạn đã làm <b>Prelearning Activities</b> trước khi đếm ngược này kết thúc.
                  </div>
                ) : (
                  <div style={styles.warn}>
                    ⏰ Đã tới hạn <b>2 tiếng trước buổi học</b>. Hãy làm <b>Prelearning Activities</b> ngay để kịp chuẩn bị.
                  </div>
                )}
              </>
            ) : (
              <div style={styles.muted}>
                Chưa tính được buổi học tiếp theo (schedule thiếu hoặc sai format).
                <br />
                Format khuyến nghị: <b>20:00 • T3, T5, T7</b>
              </div>
            )}
          </div>

          {classes.length === 0 ? (
            <div style={styles.muted}>
              Bạn chưa tham gia lớp nào.
              <br />
              Hãy dùng ô <b>Join class bằng code</b> ở trên.
            </div>
          ) : (
            <div style={styles.list}>
              {classes.map((c) => (
                <div
                  key={c.id}
                  style={{
                    borderRadius: 16,
                    border:
                      c.id === activeClassId
                        ? "1px solid var(--lip-border-strong, rgba(255,255,255,0.22))"
                        : "1px solid var(--lip-border, rgba(255,255,255,0.12))",
                    background: "var(--lip-surface-0, rgba(255,255,255,0.03))",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={styles.tiny}>
                      Tutor: <b style={{ opacity: 0.9 }}>{c.tutorName}</b>
                    </div>
                  </div>

                  <div style={styles.tiny}>
                    Thời khóa biểu: <span style={{ opacity: 0.9 }}>{c.scheduleText}</span>
                  </div>
                  <div style={styles.tiny}>
                    Join code: <span style={{ opacity: 0.9 }}>{c.joinCode ?? "-"}</span>
                  </div>

                  <div style={styles.btnRow}>
                    {/* ✅ FIX: Join class = vào Live Classroom */}
                    <Link href={`/class/${c.id}`} style={styles.btnPrimary as any}>
                      Enter Live Class →
                    </Link>

                    {/* (giữ lại menu buổi học/prelearning nếu cần) */}
                    <Link href={`/student/class/${c.id}`} style={styles.btn as any}>
                      Class menu →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "auto", ...styles.tiny }}>MVP: schedule hiện placeholder. Sau này map từ DB để đúng từng lớp.</div>
        </div>

        {/* Column 3: My Vocabulary */}
        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.colTitle}>My Vocabulary</div>
            <div style={styles.pill}>MV</div>
          </div>

          <div style={styles.cardMini}>
            <div style={{ fontWeight: 950, fontSize: 13 }}>Kho từ vựng</div>
            <div style={styles.muted}>
              Tổng số từ: <b style={{ opacity: 0.95 }}>{vocabTotal}</b>
            </div>
            <div style={styles.muted}>
              Đã ghi nhớ (ước tính): <b style={{ opacity: 0.95 }}>{vocabMasteredPct}%</b>
            </div>
            <div style={styles.tiny}>
              MVP: trong trang MV sẽ có ôn luyện trắc nghiệm → hệ thống tổng kết đúng/sai → % “đã ghi nhớ” hiển thị ở dashboard.
            </div>
          </div>

          <div style={styles.btnRow}>
            <Link href="/student/vocabulary" style={styles.btnPrimary as any}>
              Open My Vocabulary →
            </Link>
          </div>

          <div style={{ marginTop: "auto", ...styles.tiny }}>
            Gợi ý: bạn tự quyết định từ nào “mới với mình” và thêm vào kho — MV sẽ phản ánh đúng bạn nhất.
          </div>
        </div>

        {/* Column 4: My Profile */}
        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.colTitle}>My Profile</div>
            <div style={styles.pill}>Summary</div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                border: "1px solid var(--lip-border, rgba(255,255,255,0.14))",
                background: "var(--lip-surface-0, rgba(255,255,255,0.04))",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 950,
              }}
              title="Avatar (MVP placeholder)"
            >
              {me?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                "🙂"
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 950, fontSize: 14 }}>{displayName}</div>
              <div style={styles.tiny}>User ID: {userId ? `${userId.slice(0, 8)}…` : "-"}</div>
            </div>
          </div>

          <div style={styles.cardMini}>
            <div style={{ fontWeight: 950, fontSize: 13 }}>{profileSummary.title}</div>
            <div style={{ ...styles.muted, lineHeight: 1.6 }}>
              {profileSummary.lines.map((line, idx) => (
                <div key={idx}>• {line}</div>
              ))}
            </div>
            <div style={styles.tiny}>MVP: summary hiện rule-based. Sau này thay bằng AI prompt “khen trước – minh bạch – truyền động lực”.</div>
          </div>

          <div style={styles.btnRow}>
            <button
              style={styles.btnPrimary}
              onClick={() =>
                alert("MVP: upload avatar + AI summary sẽ làm tiếp.\nAI sẽ luôn khen trước, động viên, nhưng vẫn nêu rõ mục tiêu cải thiện.")
              }
            >
              Update profile →
            </button>
          </div>

          <div style={{ marginTop: "auto", ...styles.tiny }}>Nếu bạn muốn: mình sẽ thiết kế prompt AI profile summary đúng tone “khen trước – động lực – minh bạch”.</div>
        </div>
      </div>

      {/* Responsive */}
      <style jsx>{`
        @media (max-width: 1200px) {
          .grid4 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 720px) {
          .grid4 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Slide modal */}
      {slideOpen && slideLesson ? (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            setSlideOpen(false);
            setSlideLesson(null);
            setSlideUrl("");
            setSlideErr("");
            setSlideLoading(false);
          }}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 950, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                Lesson {slideLesson.order}: {slideLesson.title} — Slide
              </div>

              {/* ✅ Fullscreen + Open new tab + Close */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={styles.btnGhost}
                  disabled={!slideUrl}
                  title={!slideUrl ? "Chưa có URL slide" : slideIsFullscreen ? "Thoát fullscreen" : "Fullscreen"}
                  onClick={async () => {
                    if (!slideUrl) return;
                    if (slideIsFullscreen) {
                      await exitFullscreen();
                      return;
                    }
                    await requestFullscreenForSlide();
                  }}
                >
                  {slideIsFullscreen ? "Exit fullscreen" : "Fullscreen"}
                </button>

                <button
                  style={styles.btnGhost}
                  disabled={!slideUrl}
                  title={!slideUrl ? "Chưa có URL slide" : "Mở tab mới để xem fullscreen"}
                  onClick={() => {
                    if (!slideUrl) return;
                    window.open(slideUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  Open new tab
                </button>

                <button
                  style={styles.btnGhost}
                  onClick={() => {
                    setSlideOpen(false);
                    setSlideLesson(null);
                    setSlideUrl("");
                    setSlideErr("");
                    setSlideLoading(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={styles.cardMini}>
              <div style={styles.tiny}>
                Updated: <span style={{ opacity: 0.9 }}>{slideLesson.slideUpdatedAt ? safeDate(slideLesson.slideUpdatedAt) : "-"}</span>
              </div>

              {slideLoading ? <div style={styles.muted}>Đang tải slide…</div> : null}
              {slideErr ? <div style={{ ...styles.muted, color: "var(--lip-error, #ffb4b4)" }}>Error: {slideErr}</div> : null}

              {!slideLoading && !slideErr && slideUrl ? (
                <div
                  ref={slideFrameWrapRef}
                  style={{
                    height: "70vh",
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid var(--lip-border, rgba(255,255,255,0.12))",
                    background: "rgba(0,0,0,0.25)",
                  }}
                >
                  <iframe
                    src={slideUrl}
                    title="Lesson slide"
                    style={{ width: "100%", height: "100%", border: "none" }}
                    allow="fullscreen"
                    allowFullScreen
                  />
                </div>
              ) : null}

              {!slideLoading && !slideErr && !slideUrl ? (
                <div style={styles.btnRow}>
                  <button
                    style={styles.btn}
                    onClick={async () => {
                      await fetchSlideSignedUrl(slideLesson.id);
                    }}
                  >
                    Tải lại →
                  </button>
                </div>
              ) : null}

              {/* Hint */}
              {!slideErr && slideUrl ? (
                <div style={styles.tiny} title="Gợi ý fullscreen">
                  Tip: nếu browser không cho fullscreen trong modal, dùng <b>Open new tab</b> để xem toàn màn hình.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Prelearning detail modal */}
      {detailOpen && detailLesson ? (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            setDetailOpen(false);
            setDetailLesson(null);
          }}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 950, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                Lesson {detailLesson.order}: {detailLesson.title} — Prelearning details
              </div>
              <button
                style={styles.btnGhost}
                onClick={() => {
                  setDetailOpen(false);
                  setDetailLesson(null);
                }}
              >
                Close
              </button>
            </div>

            <div style={styles.cardMini}>
              <div style={styles.muted}>
                Điểm gần nhất:{" "}
                <b style={{ opacity: 0.95 }}>{detailLesson.prelearningScore != null ? `${detailLesson.prelearningScore}/10` : "-"}</b>{" "}
                <span style={{ opacity: 0.65 }}>• {detailLesson.prelearningCreatedAt ? safeDate(detailLesson.prelearningCreatedAt) : ""}</span>
              </div>
              <div style={styles.tiny}>MVP: show notebook thumbnails + feedback preview. Sau sẽ show đủ quiz + answers + weak points.</div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 13 }}>Notebook images</div>
              <div style={styles.tiny}>Click ảnh để phóng to</div>
            </div>

            <div style={styles.gridImgs}>
              {(detailLesson.latestAttempt?.notebook_image_urls ?? []).filter(Boolean).map((u, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${u}-${idx}`}
                  src={u}
                  alt={`notebook ${idx + 1}`}
                  style={styles.imgThumb}
                  onClick={() => {
                    setLightboxUrl(u);
                    setLightboxOpen(true);
                  }}
                />
              ))}

              {(detailLesson.latestAttempt?.notebook_image_urls ?? []).length === 0 ? (
                <div style={styles.muted}>Chưa có ảnh notebook trong attempt này.</div>
              ) : null}
            </div>

            <div style={styles.cardMini}>
              <div style={{ fontWeight: 950, fontSize: 13 }}>AI feedback (preview)</div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.5,
                  opacity: 0.85,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(detailLesson.latestAttempt?.ai_feedback ?? {}, null, 2)}
              </pre>
            </div>

            <div style={styles.btnRow}>
              <Link href={`/student/prelearning/${detailLesson.id}`} style={styles.btnPrimary as any}>
                Làm lại prelearning →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Lightbox */}
      {lightboxOpen ? (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            setLightboxOpen(false);
            setLightboxUrl("");
          }}
        >
          <div
            style={{
              width: "min(1100px, 96vw)",
              maxHeight: "92vh",
              borderRadius: 18,
              border: "1px solid var(--lip-border, rgba(255,255,255,0.14))",
              background: "var(--lip-modal-bg, rgba(16,16,16,0.92))",
              padding: 12,
              boxShadow: "var(--lip-shadow-strong, 0 18px 60px rgba(0,0,0,0.35))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 950, fontSize: 13 }}>Notebook image</div>
              <button
                style={styles.btnGhost}
                onClick={() => {
                  setLightboxOpen(false);
                  setLightboxUrl("");
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 10, overflow: "auto" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="notebook full"
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: "1px solid var(--lip-border, rgba(255,255,255,0.12))",
                  objectFit: "contain",
                  background: "var(--lip-surface-0, rgba(255,255,255,0.02))",
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
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

  seed?: string | null;

  total_score: number | null;
  notebook_content_score?: number | null;
  notebook_presentation_score?: number | null;
  quiz_score?: number | null;
  questions_score?: number | null;

  pre_quiz_total?: number | null;
  pre_quiz_correct?: number | null;

  notebook_image_urls?: string[] | null;
  notebook_images?: string[] | null;

  quiz_payload?: any;
  quiz_answers?: number[] | null;
  questions?: string[] | null;

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

type PrelearningSummaryRow = {
  id: string;
  lesson_id: string;
  class_id: string;
  student_id: string;
  created_at: string;
  total_score: number | null;
  pre_quiz_total?: number | null;
  pre_quiz_correct?: number | null;
};

type ClassVM = {
  id: string;
  name: string;
  tutorName: string;
  joinCode: string | null;
  scheduleText: string;
};

type LessonVM = {
  id: string;
  title: string;
  rawTitle: string;
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
  latestAttemptSummary?: PrelearningSummaryRow | null;
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

function parseSchedule(
  scheduleText: string
): { hour: number; minute: number; dowSet: Set<number> } | null {
  const t = (scheduleText || "").trim();
  if (!t) return null;

  const timeMatch = t.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!timeMatch) return null;

  const hour = Math.max(0, Math.min(23, Number(timeMatch[1])));
  const minute = Math.max(0, Math.min(59, Number(timeMatch[2])));

  const dowSet = new Set<number>();
  const raw = t.replace(/•/g, " ");
  const parts = raw.split(/[,]/).map((x) => x.trim().toUpperCase());

  for (const p of parts) {
    const m = p.match(/T\s*([2-7])/);
    if (m) {
      const d = Number(m[1]);
      dowSet.add(d - 1);
      continue;
    }
    if (
      p.includes("CN") ||
      p.includes("CHU NHAT") ||
      p.includes("CHỦ NHẬT")
    ) {
      dowSet.add(0);
      continue;
    }
  }

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

function stripLeadingLessonPrefix(title: string) {
  const t = String(title ?? "").trim();
  return t.replace(/^(?:lesson\s*\d+\s*:\s*)+/i, "").trim();
}

function formatPracticeScore(
  correct: number | null,
  total: number | null,
  pct: number | null
) {
  if (typeof correct !== "number" || typeof total !== "number" || total <= 0)
    return "";
  const pctText = typeof pct === "number" ? ` ~ ${pct}%` : "";
  return `${correct}/${total}${pctText}`;
}

function normalizeJoinCode(input: string) {
  return String(input || "").trim().toUpperCase();
}

function mapJoinRpcErrorMessage(errMsg: string) {
  const m = String(errMsg || "");
  if (m.includes("JOIN_CODE_NOT_FOUND"))
    return "Join code không đúng hoặc lớp không tồn tại.";
  if (m.includes("CLASS_FULL")) return "Lớp đã đủ học sinh (tối đa 2).";
  return "";
}

type NormalizedAiFeedback = {
  notebook: string[];
  questions: string[];
  rewrite: string[];
  other: Array<{ key: string; value: any }>;
};

function isNonEmptyString(x: any): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function toStringList(maybeList: any): string[] {
  if (!maybeList) return [];
  if (Array.isArray(maybeList))
    return maybeList
      .map((x) => String(x ?? "").trim())
      .filter((s) => s.length > 0);
  if (isNonEmptyString(maybeList)) return [maybeList.trim()];
  return [];
}

function normalizeAiFeedback(raw: any): NormalizedAiFeedback {
  const out: NormalizedAiFeedback = {
    notebook: [],
    questions: [],
    rewrite: [],
    other: [],
  };

  if (!raw || typeof raw !== "object") return out;

  const notebookKeys = [
    "notebook_feedback",
    "notebook",
    "notebookNotes",
    "notebook_notes",
    "notebook_comments",
    "notebook_comment",
    "notebook_feedback_preview",
    "notebook_feedback_list",
  ];

  const questionKeys = [
    "questions_feedback",
    "question_feedback",
    "questions",
    "quiz_feedback",
    "quiz",
    "q_feedback",
    "common_mistakes",
    "mistakes",
  ];

  const rewriteKeys = [
    "rewrite_suggestions",
    "rewrite",
    "suggestions",
    "suggested_rewrites",
    "rewrite_tips",
  ];

  for (const k of notebookKeys) {
    if (raw[k] != null) out.notebook.push(...toStringList(raw[k]));
  }
  for (const k of questionKeys) {
    if (raw[k] != null) out.questions.push(...toStringList(raw[k]));
  }
  for (const k of rewriteKeys) {
    if (raw[k] != null) out.rewrite.push(...toStringList(raw[k]));
  }

  const sectionCandidates = ["sections", "feedback", "ai", "result"];
  for (const sk of sectionCandidates) {
    const sec = raw[sk];
    if (!sec || typeof sec !== "object") continue;
    for (const k of notebookKeys)
      if (sec[k] != null) out.notebook.push(...toStringList(sec[k]));
    for (const k of questionKeys)
      if (sec[k] != null) out.questions.push(...toStringList(sec[k]));
    for (const k of rewriteKeys)
      if (sec[k] != null) out.rewrite.push(...toStringList(sec[k]));
  }

  const dedup = (arr: string[]) => {
    const seen = new Set<string>();
    const res: string[] = [];
    for (const s of arr) {
      const key = s.trim();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      res.push(key);
    }
    return res;
  };
  out.notebook = dedup(out.notebook);
  out.questions = dedup(out.questions);
  out.rewrite = dedup(out.rewrite);

  const used = new Set<string>([
    ...notebookKeys,
    ...questionKeys,
    ...rewriteKeys,
    ...sectionCandidates,
  ]);
  Object.keys(raw).forEach((k) => {
    if (used.has(k)) return;
    if (raw[k] == null) return;
    out.other.push({ key: k, value: raw[k] });
  });

  return out;
}

function stringifySafe(obj: any) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return String(obj ?? "");
  }
}

export default function StudentDashboard() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [err, setErr] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);

  const [userId, setUserId] = useState("");
  const [userMetaName, setUserMetaName] = useState<string>("");
  const [userEmailName, setUserEmailName] = useState<string>("");
  const [me, setMe] = useState<ProfileRow | null>(null);

  const [classes, setClasses] = useState<ClassVM[]>([]);
  const [activeClassId, setActiveClassId] = useState("");

  const [lessons, setLessons] = useState<LessonVM[]>([]);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessonTab, setLessonTab] = useState<LessonTab>("prelearning");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLesson, setDetailLesson] = useState<LessonVM | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState("");
  const [lightboxNatural, setLightboxNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const [slideOpen, setSlideOpen] = useState(false);
  const [slideLesson, setSlideLesson] = useState<LessonVM | null>(null);
  const [slideLoading, setSlideLoading] = useState(false);
  const [slideErr, setSlideErr] = useState("");
  const [slideUrl, setSlideUrl] = useState<string>("");

  const slideFrameWrapRef = useRef<HTMLDivElement | null>(null);
  const [slideIsFullscreen, setSlideIsFullscreen] = useState(false);

  const [vocabTotal] = useState(0);
  const [vocabMasteredPct] = useState(0);

  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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

      if (slideUrl) window.open(slideUrl, "_blank", "noopener,noreferrer");
    } catch {
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
    } catch {}
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

  useEffect(() => {
    if (!slideOpen && slideIsFullscreen) {
      exitFullscreen();
    }
  }, [slideOpen, slideIsFullscreen]);

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

      const res = await fetch(
        `/api/lesson-slide-signed-url?lessonId=${encodeURIComponent(lessonId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

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

  async function fetchSignedPrelearningAttempts(params: {
    classId: string;
    studentId: string;
    lessonIds: string[];
  }) {
    const { data: auth } = await supabase.auth.getSession();
    const accessToken = auth.session?.access_token;
    if (!accessToken)
      return { attempts: [] as AttemptRow[], error: "Missing session token" };

    const qs = new URLSearchParams();
    qs.set("classId", params.classId);
    qs.set("studentId", params.studentId);
    if (params.lessonIds.length) qs.set("lessonIds", params.lessonIds.join(","));
    qs.set("limit", "300");

    const res = await fetch(`/api/prelearning/attempts?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok)
      return {
        attempts: [] as AttemptRow[],
        error: String(json?.error || "Failed to load attempts"),
      };

    const attempts = Array.isArray(json?.attempts)
      ? (json.attempts as AttemptRow[])
      : [];
    return { attempts, error: "" };
  }

  async function fetchSignedPrelearningAttemptForLesson(params: {
    classId: string;
    studentId: string;
    lessonId: string;
  }) {
    const result = await fetchSignedPrelearningAttempts({
      classId: params.classId,
      studentId: params.studentId,
      lessonIds: [params.lessonId],
    });

    if (result.error) return { attempt: null as AttemptRow | null, error: result.error };

    const first =
      result.attempts.find((x) => String(x.lesson_id) === params.lessonId) ?? null;

    return { attempt: first, error: "" };
  }

  async function loadStudentDashboardState(opts?: {
    preferActiveClassId?: string;
  }) {
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
    const metaName = String(
      meta.full_name || meta.name || meta.display_name || ""
    ).trim();
    setUserMetaName(metaName);

    const emailName = guessNameFromEmail(session.user.email ?? null);
    setUserEmailName(emailName);

    try {
      const { data: meRow, error: meErr } = await supabase
        .from("v_my_profile")
        .select("id,full_name,avatar_url")
        .maybeSingle();

      if (meErr) {
        console.warn("[StudentDashboard] v_my_profile select error:", meErr);
        setMe(null);
      } else {
        setMe((meRow as any) ?? null);
      }
    } catch (e: any) {
      console.warn("[StudentDashboard] v_my_profile fetch crash:", e);
      setMe(null);
    }

    const { data: memberships, error: memErr } = await supabase
      .from("class_members")
      .select("class_id")
      .eq("student_id", uid);

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

    const { data: classRows, error: classErr } = await supabase
      .from("classes")
      .select("id,name,tutor_id,join_code,created_at")
      .in("id", classIds);

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

    const tutorIds = Array.from(
      new Set((classRows ?? []).map((c: any) => c.tutor_id))
    );
    const { data: tutorRows, error: tutorErr } = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", tutorIds);

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
    (tutorRows ?? []).forEach((t: TutorRow) =>
      tutorMap.set(t.id, t.full_name ?? "Tutor")
    );

    const vms: ClassVM[] = (classRows ?? [])
      .sort((a: any, b: any) =>
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
      )
      .map((c: ClassRow) => ({
        id: c.id,
        name: c.name,
        tutorName: tutorMap.get(c.tutor_id) ?? "Tutor",
        joinCode: c.join_code,
        scheduleText: "20:00 • T3, T5, T7",
      }));

    setClasses(vms);

    const prefer = String(opts?.preferActiveClassId ?? "").trim();
    const nextActive =
      prefer && vms.some((x) => x.id === prefer) ? prefer : vms[0]?.id || "";
    setActiveClassId(nextActive);

    setBooting(false);
  }

  useEffect(() => {
    void loadStudentDashboardState();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!activeClassId || !userId) return;

      setErr("");
      setLessonsLoading(true);

      const { data: lessonRows, error: lessonErr } = await supabase
        .from("lessons")
        .select(
          "id,class_id,title,order_index,slide_path,slide_updated_at,created_at"
        )
        .eq("class_id", activeClassId)
        .order("order_index", { ascending: true });

      if (lessonErr) {
        if (cancelled) return;
        setErr(lessonErr.message);
        setLessons([]);
        setExpandedLessonId(null);
        setLessonsLoading(false);
        return;
      }

      const lessonList = ((lessonRows as LessonRow[]) ?? []).map((l) => ({
        ...l,
        title: String(l.title ?? ""),
        slide_path: (l as any).slide_path ?? null,
        slide_updated_at: (l as any).slide_updated_at ?? null,
      }));

      if (cancelled) return;

      const lessonIds = lessonList.map((l) => l.id);

      const quickLessonVMs: LessonVM[] = lessonList.map((l) => {
        const cleanedTitle = stripLeadingLessonPrefix(l.title);
        return {
          id: l.id,
          rawTitle: l.title,
          title: cleanedTitle || l.title,
          order: l.order_index,

          slidePath: (l.slide_path as any) ?? null,
          slideUpdatedAt: (l.slide_updated_at as any) ?? null,

          prelearningDone: false,
          practiceDone: false,

          prelearningScore: null,
          prelearningCreatedAt: undefined,

          practiceCorrect: null,
          practiceTotal: null,
          practicePct: null,
          practiceCreatedAt: undefined,

          latestAttempt: null,
          latestAttemptSummary: null,
        };
      });

      setLessons(quickLessonVMs);

      if (lessonIds.length === 0) {
        setExpandedLessonId(null);
        setLessonsLoading(false);
        return;
      }

      const { data: preRows, error: preErr } = await supabase
        .from("prelearning_attempts")
        .select(
          "id,lesson_id,class_id,student_id,created_at,total_score,pre_quiz_total,pre_quiz_correct"
        )
        .eq("student_id", userId)
        .eq("class_id", activeClassId)
        .in("lesson_id", lessonIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (preErr) {
        console.warn(
          "[StudentDashboard] prelearning_attempts summary select error:",
          preErr
        );
      }

      let practiceRows: PracticeAttemptRow[] = [];
      if (lessonIds.length > 0) {
        const { data: pracRows, error: pracErr } = await supabase
          .from("practice_attempts")
          .select(
            "id,lesson_id,student_id,correct_count,total_count,pct,created_at"
          )
          .eq("student_id", userId)
          .in("lesson_id", lessonIds)
          .order("created_at", { ascending: false })
          .limit(500);

        if (pracErr) {
          console.warn(
            "[StudentDashboard] practice_attempts select error:",
            pracErr
          );
        } else {
          practiceRows = (pracRows as any) ?? [];
        }
      }

      if (cancelled) return;

      const latestPreByLesson = new Map<string, PrelearningSummaryRow>();
      (((preRows as PrelearningSummaryRow[]) ?? []) as PrelearningSummaryRow[]).forEach(
        (a) => {
          const lid = String(a.lesson_id);
          if (!latestPreByLesson.has(lid)) latestPreByLesson.set(lid, a);
        }
      );

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

          prelearningScore: (latestPre?.total_score as any) ?? null,
          prelearningCreatedAt: latestPre?.created_at,

          practiceCorrect: latestPrac?.correct_count ?? null,
          practiceTotal: latestPrac?.total_count ?? null,
          practicePct: latestPrac?.pct ?? null,
          practiceCreatedAt: latestPrac?.created_at,

          latestAttempt: null,
          latestAttemptSummary: latestPre,
        };
      });

      setLessons(lessonVMs);
      setExpandedLessonId((prev) =>
        prev && lessonVMs.some((x) => x.id === prev) ? prev : null
      );
      setLessonsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeClassId, userId]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) ?? null,
    [classes, activeClassId]
  );

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
    const scores = lessons
      .map((l) => l.prelearningScore)
      .filter((x) => typeof x === "number") as number[];
    const avg = scores.length
      ? Math.round(
          (scores.reduce((a, b) => a + b, 0) / scores.length) * 10
        ) / 10
      : null;

    if (total === 0) {
      return {
        title: "Bạn đang khởi động rất tốt 💪",
        lines: [
          "Hiện lớp chưa có lesson để học.",
          "Khi tutor tạo lesson, bạn sẽ thấy danh sách Lesson 1..N ở cột Lessons.",
        ],
      };
    }
    if (done === 0) {
      return {
        title: "Bắt đầu đúng hướng rồi đó ✨",
        lines: [
          "Tiếp theo: chọn Lesson 1 → Prelearning Activities.",
          "Mẹo: ghi vở sạch/đủ ý + làm quiz kỹ sẽ tăng điểm rất nhanh.",
        ],
      };
    }
    return {
      title: "Tiến bộ đang lên rồi 🚀",
      lines: [
        `Bạn đã hoàn thành prelearning: ${done}/${total} lesson.`,
        avg != null
          ? `Điểm prelearning trung bình: ~ ${avg}/10.`
          : "Chưa đủ dữ liệu điểm trung bình.",
        "Điểm mạnh: bạn đang duy trì nhịp học.",
        "Gợi ý: làm đều (đừng dồn), và ghi vở rõ ràng để feedback chuẩn hơn.",
      ],
    };
  }, [lessons]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

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
      const { data, error } = await supabase.rpc("join_class_by_code", {
        p_join_code: code,
      });

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

  async function openPrelearningDetail(lesson: LessonVM) {
    if (!activeClassId || !userId) return;

    setDetailErr("");
    setDetailLoading(true);

    const summary = lesson.latestAttemptSummary;

    setDetailLesson({
      ...lesson,
      latestAttempt:
        summary != null
          ? ({
              id: summary.id,
              lesson_id: summary.lesson_id,
              class_id: summary.class_id,
              student_id: summary.student_id,
              created_at: summary.created_at,
              total_score: summary.total_score,
              pre_quiz_total: summary.pre_quiz_total ?? null,
              pre_quiz_correct: summary.pre_quiz_correct ?? null,
            } as AttemptRow)
          : null,
    });
    setDetailOpen(true);

    try {
      const { attempt, error } = await fetchSignedPrelearningAttemptForLesson({
        classId: activeClassId,
        studentId: userId,
        lessonId: lesson.id,
      });

      if (error) {
        setDetailErr(error);
        return;
      }

      if (!attempt) {
        setDetailErr("Không tìm thấy attempt chi tiết cho lesson này.");
        return;
      }

      setDetailLesson((prev) => {
        if (!prev || prev.id !== lesson.id) return prev;
        return {
          ...prev,
          latestAttempt: attempt,
        };
      });

      setLessons((prev) =>
        prev.map((x) =>
          x.id === lesson.id
            ? {
                ...x,
                latestAttempt: attempt,
              }
            : x
        )
      );
    } catch (e: any) {
      setDetailErr(e?.message || "Lỗi không xác định khi tải chi tiết.");
    } finally {
      setDetailLoading(false);
    }
  }

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      padding: 20,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      color: "var(--foreground)",
      background:
        "radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 28%), linear-gradient(180deg, #f4f8fc 0%, var(--background) 22%, #ecf2f8 100%)",
    },
    topbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "2px 2px 6px",
    },
    title: {
      fontSize: 24,
      fontWeight: 900,
      letterSpacing: "-0.03em",
      color: "var(--foreground)",
    },
    subtitle: {
      fontSize: 13,
      color: "var(--muted-strong)",
    },
    row: { display: "flex", gap: 10, alignItems: "center" },
    select: {
      height: 42,
      borderRadius: 16,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.94)",
      color: "var(--foreground)",
      padding: "0 12px",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      outline: "none",
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.75) inset, 0 2px 8px rgba(15, 23, 42, 0.03)",
    },
    input: {
      height: 44,
      borderRadius: 16,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.94)",
      color: "var(--foreground)",
      padding: "0 14px",
      fontWeight: 700,
      fontSize: 13,
      outline: "none",
      width: "100%",
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.75) inset, 0 2px 8px rgba(15, 23, 42, 0.03)",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 14,
      alignItems: "start",
    },
    col: {
      borderRadius: 24,
      border: "1px solid var(--border)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,255,0.96))",
      padding: 16,
      minHeight: 560,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      overflow: "hidden",
      boxShadow: "var(--shadow-md)",
    },
    colHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingBottom: 12,
      borderBottom: "1px solid rgba(216, 226, 238, 0.9)",
    },
    colTitle: {
      fontSize: 13,
      fontWeight: 950,
      letterSpacing: "0.01em",
      color: "var(--foreground)",
    },
    pill: {
      fontSize: 11,
      padding: "5px 10px",
      borderRadius: 999,
      border: "1px solid var(--border)",
      background: "#eaf0f7",
      color: "#41556f",
      fontWeight: 700,
      whiteSpace: "nowrap",
      boxShadow: "var(--shadow-sm)",
    },

    legendRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      fontSize: 11,
      color: "var(--muted-strong)",
    },
    legendRight: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      color: "var(--muted-strong)",
    },

    list: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      overflow: "auto",
      paddingRight: 6,
    },
    muted: {
      fontSize: 12,
      color: "var(--muted-strong)",
      lineHeight: 1.65,
    },
    tiny: {
      fontSize: 11,
      color: "var(--muted)",
      lineHeight: 1.55,
    },
    divider: {
      height: 1,
      background:
        "linear-gradient(90deg, transparent, rgba(196, 210, 227, 0.9), transparent)",
      width: "100%",
    },
    expandPanel: {
      borderRadius: 18,
      border: "1px solid rgba(216, 226, 238, 0.9)",
      background: "rgba(255,255,255,0.82)",
      boxShadow: "var(--shadow-sm)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      backdropFilter: "blur(10px)",
    },
    btnRow: { display: "flex", gap: 10, flexWrap: "wrap" },
    btnPrimary: {
      borderRadius: 17,
      padding: "11px 14px",
      border: "1px solid rgba(29, 78, 216, 0.2)",
      background:
        "linear-gradient(180deg, #4d8df7 0%, var(--accent) 48%, var(--accent-pressed) 100%)",
      color: "#ffffff",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 13,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.24) inset, 0 6px 16px rgba(59,130,246,0.18), 0 2px 6px rgba(15,23,42,0.06)",
    },
    btn: {
      borderRadius: 16,
      padding: "10px 13px",
      border: "1px solid var(--border-strong)",
      background: "linear-gradient(180deg, #ffffff 0%, #f7faff 100%)",
      color: "var(--foreground)",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 13,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(15,23,42,0.04)",
    },
    btnGhost: {
      borderRadius: 16,
      padding: "10px 13px",
      border: "1px solid var(--border-strong)",
      background: "linear-gradient(180deg, #ffffff 0%, #f7faff 100%)",
      color: "var(--foreground)",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 13,
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(15,23,42,0.04)",
    },
    cardMini: {
      borderRadius: 20,
      border: "1px solid rgba(216, 226, 238, 0.9)",
      background: "rgba(255,255,255,0.78)",
      boxShadow: "var(--shadow-sm)",
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      backdropFilter: "blur(10px)",
    },
    countdownCard: {
      borderRadius: 20,
      border: "1px solid var(--border)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,255,0.96))",
      boxShadow: "var(--shadow-sm)",
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    },
    countdownBig: {
      fontSize: 26,
      fontWeight: 900,
      letterSpacing: "0.02em",
      color: "var(--foreground)",
    },
    warn: {
      borderRadius: 14,
      border: "1px solid rgba(245, 158, 11, 0.25)",
      background: "rgba(255, 243, 218, 0.88)",
      padding: 10,
      fontSize: 12,
      lineHeight: 1.6,
      color: "#8a5a00",
    },
    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.28)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      zIndex: 50,
    },
    modal: {
      width: "min(980px, 96vw)",
      maxHeight: "88vh",
      borderRadius: 24,
      border: "1px solid var(--border)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,251,255,0.98))",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      overflow: "hidden",
      boxShadow: "var(--shadow-lg)",
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
      borderRadius: 16,
      border: "1px solid var(--border)",
      objectFit: "cover",
      background: "rgba(255,255,255,0.94)",
      cursor: "pointer",
      boxShadow: "var(--shadow-sm)",
    },

    feedbackWrap: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    feedbackGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 10,
    },
    feedbackCard: {
      borderRadius: 16,
      border: "1px solid rgba(216, 226, 238, 0.9)",
      background: "rgba(255,255,255,0.86)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minHeight: 120,
      boxShadow: "var(--shadow-sm)",
    },
    feedbackTitle: {
      fontWeight: 900,
      fontSize: 12,
      letterSpacing: "0.01em",
      color: "var(--foreground)",
    },
    feedbackList: {
      margin: 0,
      paddingLeft: 16,
      fontSize: 12,
      lineHeight: 1.65,
      color: "var(--muted-strong)",
      maxHeight: 180,
      overflow: "auto",
      paddingRight: 6,
    },
    feedbackEmpty: { fontSize: 12, color: "var(--muted)", lineHeight: 1.6 },
    toggleRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },
    rawBox: {
      margin: 0,
      fontSize: 11,
      lineHeight: 1.55,
      color: "var(--muted-strong)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: 240,
      overflow: "auto",
      paddingRight: 6,
      borderRadius: 14,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.94)",
      padding: 10,
    },
  };

  function lessonRowStyle(active: boolean): React.CSSProperties {
    return {
      borderRadius: 18,
      border: active ? "1px solid #b8cce4" : "1px solid rgba(216, 226, 238, 0.9)",
      background: active
        ? "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(240,247,255,0.96))"
        : "rgba(255,255,255,0.78)",
      padding: 12,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      transition:
        "transform 120ms ease, background 120ms ease, border 120ms ease, box-shadow 120ms ease",
      boxShadow: active ? "var(--shadow-md)" : "var(--shadow-sm)",
    };
  }

  function tickBadge(done: boolean): React.CSSProperties {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      fontWeight: 800,
      padding: "6px 10px",
      borderRadius: 999,
      border: done
        ? "1px solid rgba(22, 163, 74, 0.22)"
        : "1px solid var(--border)",
      background: done ? "#dcfce7" : "#eaf0f7",
      color: done ? "#15803d" : "#41556f",
      userSelect: "none",
      whiteSpace: "nowrap",
    };
  }

  function menuItem(active: boolean): React.CSSProperties {
    return {
      width: "100%",
      borderRadius: 16,
      padding: "11px 12px",
      border: active ? "1px solid #b8cce4" : "1px solid var(--border)",
      background: active
        ? "linear-gradient(180deg, #ffffff 0%, #eef6ff 100%)"
        : "linear-gradient(180deg, #ffffff 0%, #f7faff 100%)",
      color: "var(--foreground)",
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 12,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(15,23,42,0.04)",
    };
  }

  if (booting) return <div style={{ padding: 20, opacity: 0.8 }}>Loading…</div>;
  if (err)
    return (
      <div style={{ padding: 20, color: "var(--danger)" }}>Error: {err}</div>
    );

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={styles.title}>Student Dashboard</div>
          <div style={styles.subtitle}>
            {displayName ? `Hi, ${displayName}` : "Hi"} • Chọn lesson để học và
            theo dõi tiến bộ
          </div>
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

      <div style={styles.grid} className="grid4">
        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.colTitle}>Lessons</div>
            <div style={styles.pill}>
              {lessonsLoading ? "Loading..." : `${lessons.length} lessons`}
            </div>
          </div>

          <div style={styles.legendRow}>
            <div>{lessonsLoading ? "Đang tải lesson summary..." : "Chọn lesson để mở menu"}</div>
            <div style={styles.legendRight}>
              <div style={{ fontWeight: 800 }}>Prelearning</div>
              <div style={{ fontWeight: 800 }}>Luyện tập</div>
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
                const pracScoreText = formatPracticeScore(
                  l.practiceCorrect,
                  l.practiceTotal,
                  l.practicePct
                );

                return (
                  <div
                    key={l.id}
                    style={lessonRowStyle(active)}
                    onClick={() => setExpandedLessonId(active ? null : l.id)}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = "translateY(-1px)";
                      el.style.boxShadow = "var(--shadow-md)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = "translateY(0px)";
                      el.style.boxShadow = active
                        ? "var(--shadow-md)"
                        : "var(--shadow-sm)";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "var(--foreground)",
                        }}
                      >
                        Lesson {l.order}: {l.title}
                      </div>

                      <div
                        style={{ display: "flex", gap: 10, alignItems: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={tickBadge(l.prelearningDone)}>
                          <span>{l.prelearningDone ? "✅" : "⬜"}</span>
                          <span>Pre</span>
                        </div>

                        <div style={tickBadge(l.practiceDone)}>
                          <span>{l.practiceDone ? "✅" : "⬜"}</span>
                          <span>Prac</span>
                          {l.practiceDone && pracScoreText ? (
                            <span style={{ opacity: 0.9, fontWeight: 900 }}>
                              • {pracScoreText}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {active ? (
                      <div
                        style={styles.expandPanel}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          style={menuItem(lessonTab === "materials")}
                          onClick={() => setLessonTab("materials")}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span>📚</span>
                            <span>Tài liệu học tập</span>
                          </span>
                          <span style={{ opacity: 0.5, fontWeight: 900 }}>›</span>
                        </button>

                        <button
                          style={menuItem(lessonTab === "prelearning")}
                          onClick={() => setLessonTab("prelearning")}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span>✅</span>
                            <span>Prelearning Activities</span>
                          </span>
                          <span style={{ opacity: 0.5, fontWeight: 900 }}>›</span>
                        </button>

                        <button
                          style={menuItem(lessonTab === "practice")}
                          onClick={() => setLessonTab("practice")}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span>🎯</span>
                            <span>Luyện tập</span>
                          </span>
                          <span style={{ opacity: 0.5, fontWeight: 900 }}>›</span>
                        </button>

                        <div style={styles.divider} />

                        {lessonTab === "materials" ? (
                          <div style={styles.cardMini}>
                            <div style={{ fontWeight: 900, fontSize: 13 }}>
                              Slide bài giảng
                            </div>

                            {!l.slidePath ? (
                              <div style={styles.muted}>
                                Lesson này chưa có slide.
                                <br />
                                (Admin upload slide xong sẽ hiện nút “Xem slide”.)
                              </div>
                            ) : (
                              <>
                                <div style={styles.tiny}>
                                  Updated:{" "}
                                  <span style={{ color: "var(--foreground)" }}>
                                    {l.slideUpdatedAt
                                      ? safeDate(l.slideUpdatedAt)
                                      : "-"}
                                  </span>
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

                                <div
                                  style={styles.tiny}
                                  title={l.slidePath ?? ""}
                                >
                                  slide_path:{" "}
                                  <span style={{ color: "var(--foreground)" }}>
                                    {l.slidePath}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}

                        {lessonTab === "prelearning" ? (
                          <div style={styles.cardMini}>
                            <div style={{ fontWeight: 900, fontSize: 13 }}>
                              Prelearning
                            </div>

                            {l.prelearningDone ? (
                              <>
                                <div style={styles.muted}>
                                  Điểm gần nhất:{" "}
                                  <b style={{ color: "var(--foreground)" }}>
                                    {l.prelearningScore != null
                                      ? `${l.prelearningScore}/10`
                                      : "-"}
                                  </b>{" "}
                                  <span style={{ color: "var(--muted)" }}>
                                    •{" "}
                                    {l.prelearningCreatedAt
                                      ? safeDate(l.prelearningCreatedAt)
                                      : ""}
                                  </span>
                                </div>

                                <div style={styles.btnRow}>
                                  <Link
                                    href={`/student/prelearning/${l.id}`}
                                    style={styles.btn as any}
                                  >
                                    Làm lại →
                                  </Link>

                                  <button
                                    style={styles.btnPrimary}
                                    onClick={() => {
                                      void openPrelearningDetail(l);
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
                                  Làm trước buổi học để tutor biết bạn đang
                                  mạnh/yếu chỗ nào.
                                </div>
                                <div style={styles.btnRow}>
                                  <Link
                                    href={`/student/prelearning/${l.id}`}
                                    style={styles.btnPrimary as any}
                                  >
                                    Bắt đầu →
                                  </Link>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}

                        {lessonTab === "practice" ? (
                          <div style={styles.cardMini}>
                            <div style={{ fontWeight: 900, fontSize: 13 }}>
                              Luyện tập
                            </div>

                            {l.practiceDone ? (
                              <div style={styles.muted}>
                                Điểm đã chốt (lần nộp đầu):{" "}
                                <b style={{ color: "var(--foreground)" }}>
                                  {formatPracticeScore(
                                    l.practiceCorrect,
                                    l.practiceTotal,
                                    l.practicePct
                                  ) || "—"}
                                </b>{" "}
                                <span style={{ color: "var(--muted)" }}>
                                  •{" "}
                                  {l.practiceCreatedAt
                                    ? safeDate(l.practiceCreatedAt)
                                    : ""}
                                </span>
                              </div>
                            ) : (
                              <div style={styles.muted}>
                                MVP: luyện tập sẽ có <b>điểm số</b> (không dùng %
                                completion) để tránh “điền bừa”.
                                <br />
                                Sau khi nộp bài lần đầu, điểm sẽ được chốt để
                                theo dõi tiến bộ.
                              </div>
                            )}

                            <div style={styles.btnRow}>
                              <Link
                                href={`/student/practice?lessonId=${l.id}`}
                                style={styles.btnPrimary as any}
                              >
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

          <div style={{ marginTop: "auto", ...styles.tiny }}>
            Gợi ý: tick Pre/Practice giúp bạn nhìn nhanh lesson nào đang thiếu
            bước nào.
          </div>
        </div>

        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.colTitle}>My classes</div>
            <div style={styles.pill}>{classes.length} classes</div>
          </div>

          <div style={styles.cardMini}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>
              Join class bằng code
            </div>
            <div style={styles.tiny}>
              Nhập code tutor cung cấp để vào lớp (ví dụ: ABC123).
            </div>

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
              <button
                style={styles.btnPrimary}
                onClick={joinClassByCode}
                disabled={joinLoading}
              >
                {joinLoading ? "Joining…" : "Join →"}
              </button>
            </div>

            {joinMsg ? (
              <div
                style={{
                  ...styles.tiny,
                  color: joinMsg.startsWith("✅")
                    ? "var(--success)"
                    : "var(--danger)",
                }}
              >
                {joinMsg}
              </div>
            ) : null}

            <div style={styles.tiny}>
              Nếu join bị lỗi “RLS”/“permission denied”: bạn chưa tạo RPC{" "}
              <b>join_class_by_code</b> (SECURITY DEFINER) ở DB.
            </div>
          </div>

          <div style={styles.countdownCard}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "baseline",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13 }}>
                ⏳ Countdown (T-2h)
              </div>
              <div style={styles.tiny}>{activeClass?.scheduleText ?? "-"}</div>
            </div>

            {countdownVM ? (
              <>
                <div style={styles.tiny}>
                  Buổi học tiếp theo:{" "}
                  <b style={{ color: "var(--foreground)" }}>
                    {countdownVM.nextStart.toLocaleString()}
                  </b>
                </div>

                <div style={styles.countdownBig}>{countdownVM.leftText}</div>

                {!countdownVM.isLate ? (
                  <div style={styles.warn}>
                    Hãy chắc chắn bạn đã làm <b>Prelearning Activities</b> trước
                    khi đếm ngược này kết thúc.
                  </div>
                ) : (
                  <div style={styles.warn}>
                    ⏰ Đã tới hạn <b>2 tiếng trước buổi học</b>. Hãy làm{" "}
                    <b>Prelearning Activities</b> ngay để kịp chuẩn bị.
                  </div>
                )}
              </>
            ) : (
              <div style={styles.muted}>
                Chưa tính được buổi học tiếp theo (schedule thiếu hoặc sai
                format).
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
                    borderRadius: 20,
                    border:
                      c.id === activeClassId
                        ? "1px solid #b8cce4"
                        : "1px solid rgba(216, 226, 238, 0.9)",
                    background:
                      c.id === activeClassId
                        ? "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(240,247,255,0.96))"
                        : "rgba(255,255,255,0.78)",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 14,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "var(--foreground)",
                      }}
                    >
                      {c.name}
                    </div>
                    <div style={styles.tiny}>
                      Tutor: <b style={{ color: "var(--foreground)" }}>{c.tutorName}</b>
                    </div>
                  </div>

                  <div style={styles.tiny}>
                    Thời khóa biểu:{" "}
                    <span style={{ color: "var(--foreground)" }}>{c.scheduleText}</span>
                  </div>
                  <div style={styles.tiny}>
                    Join code:{" "}
                    <span style={{ color: "var(--foreground)" }}>{c.joinCode ?? "-"}</span>
                  </div>

                  <div style={styles.btnRow}>
                    <Link href={`/class/${c.id}`} style={styles.btnPrimary as any}>
                      Enter Live Class →
                    </Link>

                    <Link
                      href={`/student/class/${c.id}`}
                      style={styles.btn as any}
                    >
                      Class menu →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "auto", ...styles.tiny }}>
            MVP: schedule hiện placeholder. Sau này map từ DB để đúng từng lớp.
          </div>
        </div>

        <div style={styles.col}>
          <div style={styles.colHeader}>
            <div style={styles.colTitle}>My Vocabulary</div>
            <div style={styles.pill}>MV</div>
          </div>

          <div style={styles.cardMini}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Kho từ vựng</div>
            <div style={styles.muted}>
              Tổng số từ: <b style={{ color: "var(--foreground)" }}>{vocabTotal}</b>
            </div>
            <div style={styles.muted}>
              Đã ghi nhớ (ước tính):{" "}
              <b style={{ color: "var(--foreground)" }}>{vocabMasteredPct}%</b>
            </div>
            <div style={styles.tiny}>
              MVP: trong trang MV sẽ có ôn luyện trắc nghiệm → hệ thống tổng kết
              đúng/sai → % “đã ghi nhớ” hiển thị ở dashboard.
            </div>
          </div>

          <div style={styles.btnRow}>
            <Link href="/student/vocabulary" style={styles.btnPrimary as any}>
              Open My Vocabulary →
            </Link>
          </div>

          <div style={{ marginTop: "auto", ...styles.tiny }}>
            Gợi ý: bạn tự quyết định từ nào “mới với mình” và thêm vào kho — MV
            sẽ phản ánh đúng bạn nhất.
          </div>
        </div>

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
                borderRadius: 18,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.92)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                boxShadow: "var(--shadow-sm)",
              }}
              title="Avatar (MVP placeholder)"
            >
              {me?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.avatar_url}
                  alt="avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                "🙂"
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: "var(--foreground)" }}>
                {displayName}
              </div>
              <div style={styles.tiny}>
                User ID: {userId ? `${userId.slice(0, 8)}…` : "-"}
              </div>
            </div>
          </div>

          <div style={styles.cardMini}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>
              {profileSummary.title}
            </div>
            <div style={{ ...styles.muted, lineHeight: 1.6 }}>
              {profileSummary.lines.map((line, idx) => (
                <div key={idx}>• {line}</div>
              ))}
            </div>
            <div style={styles.tiny}>
              MVP: summary hiện rule-based. Sau này thay bằng AI prompt “khen
              trước – minh bạch – truyền động lực”.
            </div>
          </div>

          <div style={styles.btnRow}>
            <button
              style={styles.btnPrimary}
              onClick={() =>
                alert(
                  "MVP: upload avatar + AI summary sẽ làm tiếp.\nAI sẽ luôn khen trước, động viên, nhưng vẫn nêu rõ mục tiêu cải thiện."
                )
              }
            >
              Update profile →
            </button>
          </div>

          <div style={{ marginTop: "auto", ...styles.tiny }}>
            Nếu bạn muốn: mình sẽ thiết kế prompt AI profile summary đúng tone
            “khen trước – động lực – minh bạch”.
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1200px) {
          .grid4 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .feedbackGrid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 720px) {
          .grid4 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "var(--foreground)",
                }}
              >
                Lesson {slideLesson.order}: {slideLesson.title} — Slide
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={styles.btnGhost}
                  disabled={!slideUrl}
                  title={
                    !slideUrl
                      ? "Chưa có URL slide"
                      : slideIsFullscreen
                      ? "Thoát fullscreen"
                      : "Fullscreen"
                  }
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
                  title={
                    !slideUrl
                      ? "Chưa có URL slide"
                      : "Mở tab mới để xem fullscreen"
                  }
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
                Updated:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {slideLesson.slideUpdatedAt
                    ? safeDate(slideLesson.slideUpdatedAt)
                    : "-"}
                </span>
              </div>

              {slideLoading ? (
                <div style={styles.muted}>Đang tải slide…</div>
              ) : null}
              {slideErr ? (
                <div
                  style={{
                    ...styles.muted,
                    color: "var(--danger)",
                  }}
                >
                  Error: {slideErr}
                </div>
              ) : null}

              {!slideLoading && !slideErr && slideUrl ? (
                <div
                  ref={slideFrameWrapRef}
                  style={{
                    height: "70vh",
                    borderRadius: 16,
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.92)",
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

              {!slideErr && slideUrl ? (
                <div style={styles.tiny}>
                  Tip: nếu browser không cho fullscreen trong modal, dùng{" "}
                  <b>Open new tab</b> để xem toàn màn hình.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {detailOpen && detailLesson ? (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            setDetailOpen(false);
            setDetailLesson(null);
            setDetailErr("");
            setDetailLoading(false);
          }}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "var(--foreground)",
                }}
              >
                Lesson {detailLesson.order}: {detailLesson.title} — Prelearning
                details
              </div>
              <button
                style={styles.btnGhost}
                onClick={() => {
                  setDetailOpen(false);
                  setDetailLesson(null);
                  setDetailErr("");
                  setDetailLoading(false);
                }}
              >
                Close
              </button>
            </div>

            <div style={styles.cardMini}>
              <div style={styles.muted}>
                Điểm gần nhất:{" "}
                <b style={{ color: "var(--foreground)" }}>
                  {detailLesson.prelearningScore != null
                    ? `${detailLesson.prelearningScore}/10`
                    : "-"}
                </b>{" "}
                <span style={{ color: "var(--muted)" }}>
                  •{" "}
                  {detailLesson.prelearningCreatedAt
                    ? safeDate(detailLesson.prelearningCreatedAt)
                    : ""}
                </span>
              </div>

              <div style={styles.tiny}>
                Quiz:{" "}
                <b style={{ color: "var(--foreground)" }}>
                  {typeof detailLesson.latestAttempt?.pre_quiz_correct ===
                    "number" &&
                  typeof detailLesson.latestAttempt?.pre_quiz_total === "number"
                    ? `${detailLesson.latestAttempt?.pre_quiz_correct}/${detailLesson.latestAttempt?.pre_quiz_total}`
                    : "—"}
                </b>{" "}
                • Questions:{" "}
                <b style={{ color: "var(--foreground)" }}>
                  {Array.isArray(detailLesson.latestAttempt?.questions)
                    ? detailLesson.latestAttempt!.questions!.length
                    : 0}
                </b>
              </div>

              <div style={styles.tiny}>
                MVP: show notebook thumbnails + quiz result + questions + feedback
                preview.
              </div>

              {detailLoading ? (
                <div style={styles.muted}>Đang tải chi tiết prelearning…</div>
              ) : null}

              {detailErr ? (
                <div style={{ ...styles.muted, color: "var(--danger)" }}>
                  Error: {detailErr}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13, color: "var(--foreground)" }}>
                Notebook images
              </div>
              <div style={styles.tiny}>Click ảnh để phóng to</div>
            </div>

            <div style={styles.gridImgs}>
              {(detailLesson.latestAttempt?.notebook_images ?? [])
                .filter(Boolean)
                .map((u, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${u}-${idx}`}
                    src={u}
                    alt={`notebook ${idx + 1}`}
                    style={styles.imgThumb}
                    onClick={() => {
                      setLightboxNatural(null);
                      setLightboxUrl(u);
                      setLightboxOpen(true);
                    }}
                  />
                ))}

              {(detailLesson.latestAttempt?.notebook_images ?? []).length ===
              0 ? (
                <div style={styles.muted}>
                  {detailLoading
                    ? "Đang tạo signed URL cho ảnh notebook…"
                    : "Chưa có ảnh notebook (signed) trong attempt này."}
                </div>
              ) : null}
            </div>

            <div style={styles.cardMini}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>Quiz + Questions</div>

              <div style={styles.tiny}>
                Pre-quiz:{" "}
                <b style={{ color: "var(--foreground)" }}>
                  {typeof detailLesson.latestAttempt?.pre_quiz_correct ===
                    "number" &&
                  typeof detailLesson.latestAttempt?.pre_quiz_total === "number"
                    ? `${detailLesson.latestAttempt?.pre_quiz_correct}/${detailLesson.latestAttempt?.pre_quiz_total}`
                    : "—"}
                </b>
              </div>

              {Array.isArray(detailLesson.latestAttempt?.questions) &&
              detailLesson.latestAttempt!.questions!.length > 0 ? (
                <div style={{ ...styles.muted, lineHeight: 1.6 }}>
                  {detailLesson.latestAttempt!.questions!.slice(0, 10).map((q, i) => (
                    <div key={i}>• {q}</div>
                  ))}
                </div>
              ) : (
                <div style={styles.tiny}>
                  {detailLoading
                    ? "Đang tải questions..."
                    : "Chưa có câu hỏi nào được lưu trong attempt này."}
                </div>
              )}

              <div style={styles.tiny}>
                (MVP) Nếu cần show đáp án đúng/sai từng câu, mình sẽ render từ
                quiz_payload + quiz_answers.
              </div>
            </div>

            <AiFeedbackPreview raw={detailLesson.latestAttempt?.ai_feedback} styles={styles} />

            <div style={styles.btnRow}>
              <Link
                href={`/student/prelearning/${detailLesson.id}`}
                style={styles.btnPrimary as any}
              >
                Làm lại prelearning →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxOpen ? (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            setLightboxOpen(false);
            setLightboxUrl("");
            setLightboxNatural(null);
          }}
        >
          <div
            style={{
              width: "min(1100px, 96vw)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,251,255,0.98))",
              padding: 12,
              boxShadow: "var(--shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 13,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  color: "var(--foreground)",
                }}
              >
                <span>Notebook image</span>
                {lightboxNatural ? (
                  <span style={styles.tiny}>
                    {lightboxNatural.w}×{lightboxNatural.h}
                  </span>
                ) : null}
              </div>
              <button
                style={styles.btnGhost}
                onClick={() => {
                  setLightboxOpen(false);
                  setLightboxUrl("");
                  setLightboxNatural(null);
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                maxHeight: "85vh",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="notebook full"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img?.naturalWidth && img?.naturalHeight)
                    setLightboxNatural({
                      w: img.naturalWidth,
                      h: img.naturalHeight,
                    });
                }}
                style={{
                  maxWidth: "100%",
                  maxHeight: "85vh",
                  width: "auto",
                  height: "auto",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  objectFit: "contain",
                  background: "rgba(255,255,255,0.94)",
                }}
              />
            </div>

            <div style={{ marginTop: 10, ...styles.tiny }}>
              Tip: nếu muốn zoom sau này, mình sẽ thêm controls (+/−) và pan.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AiFeedbackPreview({
  raw,
  styles,
}: {
  raw: any;
  styles: Record<string, React.CSSProperties>;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const normalized = useMemo(() => normalizeAiFeedback(raw), [raw]);
  const hasAny =
    normalized.notebook.length > 0 ||
    normalized.questions.length > 0 ||
    normalized.rewrite.length > 0;

  return (
    <div style={styles.cardMini as any}>
      <div style={{ ...styles.toggleRow }}>
        <div style={{ fontWeight: 900, fontSize: 13, color: "var(--foreground)" }}>
          AI feedback
        </div>

        <button
          type="button"
          style={styles.btnGhost as any}
          onClick={() => setShowRaw((v) => !v)}
          title="Toggle raw JSON (debug)"
        >
          {showRaw ? "Hide raw" : "View raw JSON"}
        </button>
      </div>

      {!hasAny ? (
        <div style={styles.muted as any}>Chưa có feedback.</div>
      ) : (
        <div style={styles.feedbackWrap as any}>
          <div style={styles.feedbackGrid as any} className="feedbackGrid">
            <div style={styles.feedbackCard as any}>
              <div style={styles.feedbackTitle as any}>📒 Notebook</div>
              {normalized.notebook.length ? (
                <ul style={styles.feedbackList as any}>
                  {normalized.notebook.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              ) : (
                <div style={styles.feedbackEmpty as any}>
                  Chưa có nhận xét notebook.
                </div>
              )}
            </div>

            <div style={styles.feedbackCard as any}>
              <div style={styles.feedbackTitle as any}>🧩 Questions</div>
              {normalized.questions.length ? (
                <ul style={styles.feedbackList as any}>
                  {normalized.questions.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              ) : (
                <div style={styles.feedbackEmpty as any}>
                  Chưa có nhận xét questions.
                </div>
              )}
            </div>

            <div style={styles.feedbackCard as any}>
              <div style={styles.feedbackTitle as any}>✍️ Rewrite</div>
              {normalized.rewrite.length ? (
                <ul style={styles.feedbackList as any}>
                  {normalized.rewrite.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              ) : (
                <div style={styles.feedbackEmpty as any}>
                  Chưa có gợi ý rewrite.
                </div>
              )}
            </div>
          </div>

          {normalized.other.length ? (
            <div style={{ ...styles.tiny, opacity: 0.72 }}>
              (Debug) Các field khác:{" "}
              {normalized.other.slice(0, 6).map((o, i) => (
                <span key={o.key}>
                  <b style={{ color: "var(--foreground)" }}>{o.key}</b>
                  {i < Math.min(normalized.other.length, 6) - 1 ? ", " : ""}
                </span>
              ))}
              {normalized.other.length > 6 ? "…" : ""}
            </div>
          ) : null}
        </div>
      )}

      {showRaw ? (
        <pre style={styles.rawBox as any}>{stringifySafe(raw)}</pre>
      ) : null}
    </div>
  );
}
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TRUTH_GROUND } from "@/lib/prelearning/truthGround";

type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  order_index: number;
};

type NotebookEval = {
  content_score: number; // 0-4
  presentation_score: number; // 0-2
  feedback: string[];
};

type QuizQ = {
  id: string;
  instruction_vi: string;
  instruction_en: string;
  sentence_en: string;
  choices_en: string[];
  answerIndex: number;
  skill_tag?: string;
  explain_vi?: string;
  common_mistake_vi?: string;
};

type QuizPayload = {
  questions: QuizQ[];
};

type QuestionsEval = {
  questions_score: number; // 0-2
  feedback?: string[];
  notes?: string[];
  rewrite_suggestions?: string[];
};

const UI_FONT =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function readinessCopy(score10: number) {
  if (score10 >= 8) {
    return {
      title: "✅ Bạn đã sẵn sàng cho buổi học hôm nay",
      body: "Chuẩn bị tốt. Tutor sẽ dạy nhanh và sâu hơn vì bạn đã nắm được phần nền.",
      tone: "good",
    };
  }
  if (score10 >= 6) {
    return {
      title: "🟡 Khá ổn — nhưng bạn có thể làm lại để chắc hơn",
      body: "Bạn đã có nền tảng, nhưng còn thiếu vài điểm quan trọng. Làm lại sẽ giúp buổi học hiệu quả hơn.",
      tone: "ok",
    };
  }
  return {
    title: "🔴 Chưa ổn — bạn nên làm lại để chuẩn bị tốt hơn",
    body: "Notebook/quiz/câu hỏi cho thấy bạn mới xem qua hoặc thiếu phần trọng tâm. Làm lại sẽ giúp tutor hỗ trợ đúng chỗ.",
    tone: "weak",
  };
}

function studentWeakPointFromSkill(skill?: string): { title: string; tip: string; example?: string } {
  const s = (skill ?? "").toLowerCase();

  if (s.includes("present_simple_base") || s.includes("presentsimplebase")) {
    return {
      title: "Nhầm “I / You / We / They”",
      tip: "Với I/You/We/They: dùng động từ bình thường (không thêm S/ES).",
      example: "Ví dụ: I play (không phải I plays).",
    };
  }

  if (s.includes("present_simple_s_es") || s.includes("s_es")) {
    return {
      title: "Quên thêm -s / -es với “He / She / It”",
      tip: "Với He/She/It: động từ thường thêm -s hoặc -es.",
      example: "Gợi ý -es: kết thúc bằng s/sh/ch/x/o → thêm -es (go→goes). Ví dụ: She plays / He goes.",
    };
  }

  if (s.includes("to_be") || (s.includes("be") && !s.includes("verb"))) {
    return {
      title: "Nhầm am / is / are",
      tip: "I → am, He/She/It → is, You/We/They → are.",
      example: "Ví dụ: He is (không phải He are).",
    };
  }

  if (s.includes("question_do_does") || (s.includes("question") && (s.includes("do") || s.includes("does")))) {
    return {
      title: "Nhầm Do và Does khi hỏi",
      tip: "You/We/They/I → Do. He/She/It → Does.",
      example: "Ví dụ: Do you like…? / Does he like…?",
    };
  }

  if (s.includes("negation_does_not") || (s.includes("negation") && s.includes("does"))) {
    return {
      title: "Nhầm khi dùng “does not”",
      tip: "Sau “does not” dùng động từ bình thường (không thêm -s/-es).",
      example: "Ví dụ: He does not play (không phải plays).",
    };
  }

  if (s.includes("pronoun")) {
    return {
      title: "Nhầm đại từ (I/you/he/she/it/they)",
      tip: "Mình là I, bạn là you, bạn nam là he, bạn nữ là she, đồ vật là it, nhiều người là they.",
      example: "Ví dụ: I am… / He is… / They are…",
    };
  }

  return {
    title: "Cần ôn lại quy tắc cơ bản",
    tip: "Bạn đọc lại phần lý thuyết và làm lại quiz 1 lần nữa nhé.",
  };
}

function makeSeed() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileExt(file: File) {
  const n = (file.name || "").toLowerCase();
  const ext = n.includes(".") ? n.split(".").pop() : "";
  if (ext && ext.length <= 6) return ext;
  const t = (file.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  return "jpg";
}

async function sha256Hex(file: File): Promise<string> {
  // optional, but useful
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PrelearningWizardPage() {
  const router = useRouter();
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;

  const [studentId, setStudentId] = useState<string | null>(null);

  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [lessonErr, setLessonErr] = useState<string>("");

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [notebookImages, setNotebookImages] = useState<File[]>([]);
  const [notebookEval, setNotebookEval] = useState<NotebookEval | null>(null);
  const [notebookLoading, setNotebookLoading] = useState(false);
  const [notebookErr, setNotebookErr] = useState<string>("");

  const [checklistOpen, setChecklistOpen] = useState(true);

  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizErr, setQuizErr] = useState<string>("");

  // ✅ Chống double-call + chống overwrite set:
  const requestIdRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const [questions, setQuestions] = useState<string[]>(["", "", ""]);
  const [questionsEval, setQuestionsEval] = useState<QuestionsEval | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsErr, setQuestionsErr] = useState<string>("");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitErr, setSubmitErr] = useState<string>("");
  const [finalScore10, setFinalScore10] = useState<number | null>(null);

  const [showWrongDetails, setShowWrongDetails] = useState(false);

  // ✅ seed cho attempt hiện tại
  const [seed, setSeed] = useState<string>(() => makeSeed());

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }
      setStudentId(user.id);

      setLessonErr("");
      const { data, error } = await supabase
        .from("lessons")
        .select("id, class_id, title, order_index")
        .eq("id", lessonId)
        .single();

      if (error) {
        setLessonErr(error.message);
        return;
      }
      setLesson(data as LessonRow);
    })();
  }, [lessonId, router]);

  const truth = useMemo(() => {
    if (!lessonId) return null;
    const t = (TRUTH_GROUND as any)?.[lessonId];
    return t ?? null;
  }, [lessonId]);

  const checklistText: string = useMemo(() => {
    const raw = (truth as any)?.checklistForStudents;
    if (typeof raw !== "string") return "";
    return raw.trim();
  }, [truth]);

  const quizTotal = quiz?.questions?.length ?? 0;

  const quizCorrect = useMemo(() => {
    if (!quiz?.questions?.length) return 0;
    let c = 0;
    quiz.questions.forEach((qq, idx) => {
      if (quizAnswers[idx] === qq.answerIndex) c++;
    });
    return c;
  }, [quiz, quizAnswers]);

  const computedQuizScore2 = useMemo(() => {
    if (!quizTotal) return 0;
    return round1((quizCorrect / quizTotal) * 2);
  }, [quizCorrect, quizTotal]);

  const computedNotebookScore6 = useMemo(() => {
    if (!notebookEval) return 0;
    return round1(clamp(notebookEval.content_score, 0, 4) + clamp(notebookEval.presentation_score, 0, 2));
  }, [notebookEval]);

  const computedQuestionsScore2 = useMemo(() => {
    if (!questionsEval) return 0;
    return round1(clamp(questionsEval.questions_score, 0, 2));
  }, [questionsEval]);

  const computedTotal10 = useMemo(() => {
    const total = computedNotebookScore6 + computedQuizScore2 + computedQuestionsScore2;
    return round1(clamp(total, 0, 10));
  }, [computedNotebookScore6, computedQuizScore2, computedQuestionsScore2]);

  const readiness = useMemo(() => readinessCopy(computedTotal10), [computedTotal10]);

  const wrongQuizItems = useMemo(() => {
    if (!quiz?.questions?.length) return [];
    const out: Array<{ idx: number; q: QuizQ; selected: number; correct: number }> = [];
    quiz.questions.forEach((q, idx) => {
      const selected = quizAnswers[idx];
      const correct = q.answerIndex;
      if (selected !== -1 && selected !== correct) out.push({ idx, q, selected, correct });
    });
    return out;
  }, [quiz, quizAnswers]);

  const topWeakPoints = useMemo(() => {
    const map = new Map<string, { skill: string; count: number }>();
    wrongQuizItems.forEach(({ q }) => {
      const key = (q.skill_tag ?? "other").trim() || "other";
      map.set(key, { skill: key, count: (map.get(key)?.count ?? 0) + 1 });
    });

    const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);

    const out: Array<{ title: string; tip: string; example?: string; count: number }> = [];
    const seenTitle = new Set<string>();

    for (const it of arr) {
      const m = studentWeakPointFromSkill(it.skill);
      if (seenTitle.has(m.title)) continue;
      seenTitle.add(m.title);
      out.push({ ...m, count: it.count });
      if (out.length >= 3) break;
    }
    return out;
  }, [wrongQuizItems]);

  function resetAll() {
    setStep(1);
    setSeed(makeSeed());

    setNotebookImages([]);
    setNotebookEval(null);
    setNotebookErr("");
    setNotebookLoading(false);

    // cancel in-flight quiz request if any
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;

    setQuiz(null);
    setQuizAnswers([]);
    setQuizErr("");
    setQuizLoading(false);

    setQuestions(["", "", ""]);
    setQuestionsEval(null);
    setQuestionsErr("");
    setQuestionsLoading(false);

    setSubmitErr("");
    setSubmitLoading(false);
    setFinalScore10(null);

    setShowWrongDetails(false);
  }

  async function handleEvaluateNotebook() {
    if (!lesson) return;

    if (!notebookImages.length) {
      setNotebookErr("Bạn chưa chọn ảnh vở (JPEG/PNG).");
      return;
    }

    setNotebookErr("");
    setNotebookLoading(true);
    setNotebookEval(null);

    try {
      const fd = new FormData();
      notebookImages.slice(0, 2).forEach((f) => fd.append("files", f));

      fd.append("lessonTitle", lesson.title);
      fd.append("lessonId", lesson.id);

      const res = await fetch("/api/prelearning/evaluate-notebook", { method: "POST", body: fd });

      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: "Server returned non-JSON", raw };
      }

      if (!res.ok) {
        setNotebookErr(data?.error ? `${data.error}${data.detail ? " — " + data.detail : ""}` : "Evaluate failed");
        setNotebookLoading(false);
        return;
      }

      const out: NotebookEval = {
        content_score: Number(data.content_score ?? 0),
        presentation_score: Number(data.presentation_score ?? 0),
        feedback: Array.isArray(data.feedback) ? data.feedback : [],
      };

      setNotebookEval(out);

      // ✅ Move to step 2; quiz will be generated EXACTLY ONCE when step=2
      setStep(2);
    } catch (e: any) {
      setNotebookErr(e.message ?? "Unknown error");
    } finally {
      setNotebookLoading(false);
    }
  }

  async function generateQuizOnce() {
    if (!lesson) return;

    // Prevent double-call
    if (quizLoading) return;
    if (quiz?.questions?.length) return;

    // cancel older request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const myReqId = ++requestIdRef.current;

    setQuizErr("");
    setQuizLoading(true);

    try {
      const res = await fetch("/api/prelearning/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonTitle: lesson.title }),
        signal: ac.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (myReqId !== requestIdRef.current) return; // stale
        setQuizErr(data?.error ?? "Generate quiz failed");
        return;
      }

      const qs: QuizQ[] = Array.isArray(data.questions) ? data.questions : [];
      if (!qs.length) {
        if (myReqId !== requestIdRef.current) return; // stale
        setQuizErr("Quiz rỗng (không có câu hỏi).");
        return;
      }

      // ✅ Only accept latest request result
      if (myReqId !== requestIdRef.current) return;

      setQuiz({ questions: qs });
      setQuizAnswers(new Array(qs.length).fill(-1));
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (myReqId !== requestIdRef.current) return;
      setQuizErr(e.message ?? "Unknown error");
    } finally {
      if (myReqId === requestIdRef.current) setQuizLoading(false);
    }
  }

  // ✅ Generate quiz only when entering Step 2 (NOT prefetch from Step 1)
  useEffect(() => {
    if (!lesson) return;
    if (step !== 2) return;
    if (quiz?.questions?.length) return;

    generateQuizOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id, step]);

  function addQuestionRow() {
    setQuestions((prev) => [...prev, ""]);
  }

  function updateQuestionRow(idx: number, value: string) {
    setQuestions((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function removeQuestionRow(idx: number) {
    setQuestions((prev) => {
      if (prev.length <= 3) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleEvaluateQuestions() {
    if (!lesson) return;

    const cleaned = questions.map((q) => q.trim()).filter(Boolean);
    if (cleaned.length < 3) {
      setQuestionsErr("Bạn cần viết ít nhất 3 câu hỏi.");
      return;
    }

    setQuestionsErr("");
    setQuestionsLoading(true);
    setQuestionsEval(null);

    try {
      const res = await fetch("/api/prelearning/evaluate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonTitle: lesson.title, questions: cleaned }),
      });

      const data = await res.json();
      if (!res.ok) {
        setQuestionsErr(data?.error ?? "Evaluate questions failed");
        return;
      }

      const out: QuestionsEval = {
        questions_score: Number(data.questions_score ?? 0),
        feedback: Array.isArray(data.feedback) ? data.feedback : undefined,
        notes: Array.isArray(data.notes) ? data.notes : undefined,
        rewrite_suggestions: Array.isArray(data.rewrite_suggestions) ? data.rewrite_suggestions : undefined,
      };

      setQuestionsEval(out);
      setStep(4);
    } catch (e: any) {
      setQuestionsErr(e.message ?? "Unknown error");
    } finally {
      setQuestionsLoading(false);
    }
  }

  // ✅ NEW handleSubmit: upload to storage + submit JSON with Authorization
  async function handleSubmit() {
    if (!lesson) return;
    if (!studentId) return;
    if (!notebookEval || !quiz || !questionsEval) {
      setSubmitErr("Thiếu dữ liệu (notebook/quiz/questions).");
      return;
    }

    setSubmitErr("");
    setSubmitLoading(true);

    const cleaned = questions.map((q) => q.trim()).filter(Boolean);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setSubmitErr("Bạn chưa đăng nhập (missing access token).");
        return;
      }

      // 1) Upload notebook images (max 2) to Supabase Storage (private bucket)
      const filesToUpload = notebookImages.slice(0, 2);

      if (!filesToUpload.length) {
        setSubmitErr("Bạn chưa chọn ảnh vở.");
        return;
      }

      const notebook_image_paths: string[] = [];
      const notebook_image_hashes: string[] = [];

      for (const f of filesToUpload) {
        const ext = getFileExt(f);
        const fileId = makeSeed(); // quick uuid-ish
        const path = `${studentId}/${lesson.id}/${seed}/${fileId}.${ext}`;

        // compute hash (optional)
        let hash = "";
        try {
          hash = await sha256Hex(f);
        } catch {
          hash = "";
        }

        const { error: upErr } = await supabase.storage
          .from("prelearning-notebooks")
          .upload(path, f, { upsert: false, contentType: f.type || "image/jpeg" });

        if (upErr) {
          setSubmitErr(`Upload ảnh vở thất bại: ${upErr.message}`);
          return;
        }

        notebook_image_paths.push(path);
        notebook_image_hashes.push(hash);
      }

      // 2) Submit attempt (JSON)
      const payload = {
        lesson_id: lesson.id,
        class_id: lesson.class_id,
        student_id: studentId,
        seed,

        notebook_image_paths,
        notebook_image_hashes,

        notebook_content_score: round1(clamp(notebookEval.content_score, 0, 4)),
        notebook_presentation_score: round1(clamp(notebookEval.presentation_score, 0, 2)),
        quiz_score: computedQuizScore2,
        questions_score: round1(clamp(questionsEval.questions_score, 0, 2)),

        pre_quiz_score: quizCorrect,
        pre_quiz_total: quizTotal,
        quiz_answers: quizAnswers,
        questions: cleaned,

        ai_feedback: {
          notebook_feedback: notebookEval.feedback,
          questions_feedback: questionsEval.feedback ?? questionsEval.notes ?? [],
          rewrite_suggestions: questionsEval.rewrite_suggestions ?? [],
        },
      };

      const res = await fetch("/api/prelearning/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitErr(data?.error ? `${data.error}${data.detail ? " — " + data.detail : ""}` : "Submit failed");
        return;
      }

      setFinalScore10(Number(data.totalScore ?? computedTotal10));
    } catch (e: any) {
      setSubmitErr(e.message ?? "Unknown error");
    } finally {
      setSubmitLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: 16,
    border: "1px solid var(--card-border)",
    background: "var(--card-bg)",
    boxShadow: "var(--shadow)",
    padding: 14,
    backdropFilter: "blur(10px)",
  };

  const cardSoft: React.CSSProperties = {
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    padding: 12,
  };

  const btnPrimary: React.CSSProperties = {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid var(--btn-primary-border)",
    background: "var(--btn-primary-bg)",
    color: "var(--text-primary)",
    fontWeight: 900,
    cursor: "pointer",
  };

  const btnGhost: React.CSSProperties = {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid var(--btn-border)",
    background: "var(--btn-bg)",
    color: "var(--text-primary)",
    fontWeight: 900,
    cursor: "pointer",
  };

  if (lessonErr) return <div style={{ padding: 24 }}>Error: {lessonErr}</div>;
  if (!lesson) return <div style={{ padding: 24 }}>Loading lesson…</div>;

  const selectedLabel =
    notebookImages.length === 0
      ? "Chưa chọn ảnh"
      : notebookImages.length === 1
      ? `${notebookImages[0].name} (${Math.round(notebookImages[0].size / 1024)} KB)`
      : `${notebookImages[0].name} (+${notebookImages.length - 1})`;

  const canGoToQuestions = !!quiz && quizAnswers.length > 0 && !quizAnswers.some((a) => a === -1);

  function getChoiceTextSingle(q: QuizQ, ci: number) {
    const arr = Array.isArray(q.choices_en) ? q.choices_en : [];
    return typeof arr[ci] === "string" ? arr[ci] : "";
  }

  function letter(ci: number) {
    return String.fromCharCode(65 + ci);
  }

  function explainForWrong(q: QuizQ): string {
    const direct = (q.explain_vi ?? "").trim() || (q.common_mistake_vi ?? "").trim();
    if (direct) return direct;

    const w = studentWeakPointFromSkill(q.skill_tag);
    return `${w.tip}${w.example ? " " + w.example : ""}`.trim();
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg-main)",
        color: "var(--text-primary)",
        fontFamily: UI_FONT,
        padding: 20,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Pre-learning</div>
            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 14 }}>
              Lesson L{lesson.order_index}: <b style={{ color: "var(--text-primary)" }}>{lesson.title}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => router.back()} style={btnGhost}>
              ← Back
            </button>
            <button type="button" onClick={resetAll} style={btnGhost}>
              Làm lại từ đầu
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ marginTop: 14, ...cardStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, color: "var(--text-muted)" }}>Progress</div>
            <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
              Step {step}/4 • Total: <b style={{ color: "var(--text-primary)" }}>{computedTotal10}/10</b>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <div style={{ ...cardSoft }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>📄 Notebook (0–6)</div>
              <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
                {notebookEval ? (
                  <>
                    <div>
                      Content: <b style={{ color: "var(--text-primary)" }}>{round1(notebookEval.content_score)}/4</b>
                    </div>
                    <div>
                      Presentation:{" "}
                      <b style={{ color: "var(--text-primary)" }}>{round1(notebookEval.presentation_score)}/2</b>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      Subtotal: <b style={{ color: "var(--text-primary)" }}>{computedNotebookScore6}/6</b>
                    </div>
                  </>
                ) : (
                  <div>Chưa chấm</div>
                )}
              </div>
            </div>

            <div style={{ ...cardSoft }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>🧩 Quiz (0–2)</div>
              <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
                {quiz ? (
                  <>
                    <div>
                      Correct:{" "}
                      <b style={{ color: "var(--text-primary)" }}>
                        {quizCorrect}/{quizTotal}
                      </b>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      Score: <b style={{ color: "var(--text-primary)" }}>{computedQuizScore2}/2</b>
                    </div>
                  </>
                ) : quizLoading ? (
                  <div>Đang tạo quiz...</div>
                ) : (
                  <div>Chưa có quiz</div>
                )}
              </div>
            </div>

            <div style={{ ...cardSoft }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>❓ Questions (0–2)</div>
              <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
                {questionsEval ? (
                  <>
                    <div>
                      Score: <b style={{ color: "var(--text-primary)" }}>{computedQuestionsScore2}/2</b>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
                      {questionsEval.feedback?.[0] ?? questionsEval.notes?.[0] ?? "OK"}
                    </div>
                  </>
                ) : (
                  <div>Chưa đánh giá</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
          {/* Main */}
          <div style={cardStyle}>
            {/* Step 1 */}
            {step === 1 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Step 1 — Upload ảnh vở (JPEG/PNG)</div>
                <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7 }}>
                  Dùng CamScanner/ScanCam export <b>JPG</b> (không cần PDF). Hệ thống chấm theo 2 tiêu chí:
                  <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                    <li>Đủ nội dung trọng tâm theo slide/tutor (0–4)</li>
                    <li>Trình bày, chữ viết nghiêm túc/dễ nhìn (0–2)</li>
                  </ul>
                  <div style={{ marginTop: 8, color: "var(--text-faint)" }}>
                    MVP: chấm tối đa <b>2 ảnh</b> để nhanh/rẻ. Bạn hãy chọn trang quan trọng nhất.
                  </div>
                </div>

                <div style={{ marginTop: 12, ...cardSoft }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 900 }}>📌 Nội dung bắt buộc phải chép</div>
                    <button
                      type="button"
                      onClick={() => setChecklistOpen((v) => !v)}
                      style={{ ...btnGhost, height: 34, borderRadius: 10 }}
                      aria-expanded={checklistOpen}
                    >
                      {checklistOpen ? "Thu gọn" : "Mở ra"}
                    </button>
                  </div>

                  {checklistOpen && (
                    <div style={{ marginTop: 10 }}>
                      {checklistText ? (
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: 14,
                            lineHeight: 1.75,
                            color: "var(--text-primary)",
                          }}
                        >
                          {checklistText}
                        </pre>
                      ) : (
                        <div style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7 }}>
                          ⚠️ Chưa có nội dung bắt buộc cho lesson này.
                        </div>
                      )}
                      <div style={{ marginTop: 10, color: "var(--text-faint)", fontSize: 13, lineHeight: 1.7 }}>
                        Bạn <b style={{ color: "var(--text-primary)" }}>bắt buộc</b> phải chép đúng các ý trên.
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const arr = Array.from(e.target.files ?? []);
                      setNotebookImages(arr);
                    }}
                  />
                </div>

                <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14 }}>
                  Selected: <b style={{ color: "var(--text-primary)" }}>{selectedLabel}</b>
                </div>

                {notebookErr && (
                  <pre style={{ marginTop: 10, color: "var(--danger)", whiteSpace: "pre-wrap" }}>{notebookErr}</pre>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleEvaluateNotebook}
                    style={{ ...btnPrimary, opacity: notebookLoading ? 0.7 : 1 }}
                    disabled={notebookLoading}
                  >
                    {notebookLoading ? "Chấm vở (AI)..." : "Chấm vở (AI) →"}
                  </button>
                </div>
              </>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Step 2 — Quiz</div>
                <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7 }}>
                  Quiz giúp kiểm tra bạn đã xem qua bài. Điểm quiz tối đa <b>2 điểm</b>. Bạn phải làm hết 7 câu để đi tiếp.
                </div>

                {quizLoading && (
                  <div style={{ marginTop: 12, ...cardSoft, color: "var(--text-muted)", fontSize: 14 }}>
                    ⏳ Đang tạo quiz...
                  </div>
                )}

                {quizErr && (
                  <div style={{ marginTop: 12 }}>
                    <pre style={{ margin: 0, color: "var(--danger)", whiteSpace: "pre-wrap" }}>{quizErr}</pre>
                    <button
                      type="button"
                      onClick={() => {
                        // hard retry: clear then generate once
                        setQuiz(null);
                        setQuizAnswers([]);
                        setQuizErr("");
                        generateQuizOnce();
                      }}
                      style={{ ...btnGhost, marginTop: 10 }}
                      disabled={quizLoading}
                    >
                      Thử lại
                    </button>
                  </div>
                )}

                {quiz && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
                    {quiz.questions.map((qq, idx) => (
                      <div key={qq.id} style={cardSoft}>
                        <div style={{ fontWeight: 950, fontSize: 15, lineHeight: 1.6 }}>
                          {idx + 1}. {qq.instruction_vi}
                          <span style={{ display: "block", marginTop: 4, color: "var(--text-muted)", fontWeight: 750 }}>
                            {qq.instruction_en}
                          </span>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.75, color: "var(--text-primary)" }}>
                          {qq.sentence_en}
                        </div>

                        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                          {[0, 1, 2, 3].map((ci) => {
                            const selected = quizAnswers[idx] === ci;
                            const choiceText = getChoiceTextSingle(qq, ci);

                            return (
                              <button
                                type="button"
                                key={ci}
                                onClick={() => {
                                  const next = [...quizAnswers];
                                  next[idx] = ci;
                                  setQuizAnswers(next);
                                }}
                                style={{
                                  textAlign: "left",
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: "1px solid var(--btn-border)",
                                  background: selected ? "var(--primary-weak)" : "var(--btn-bg)",
                                  color: "var(--text-primary)",
                                  cursor: "pointer",
                                  fontWeight: selected ? 900 : 750,
                                  fontSize: 14,
                                  lineHeight: 1.6,
                                }}
                              >
                                {letter(ci)}. {choiceText}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setQuestions((prev) => (prev.length >= 3 ? prev : ["", "", ""]));
                          setStep(3);
                        }}
                        style={btnPrimary}
                        disabled={!canGoToQuestions}
                        title={!canGoToQuestions ? "Hãy trả lời hết các câu" : ""}
                      >
                        Tiếp tục → (Questions)
                      </button>

                      <button type="button" onClick={() => setStep(1)} style={btnGhost}>
                        ← Back to notebook
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>Step 3 — Viết câu hỏi (min 3, không giới hạn)</div>
                  <button type="button" onClick={addQuestionRow} style={btnGhost} title="Thêm câu hỏi">
                    ＋
                  </button>
                </div>

                <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7 }}>
                  Hãy viết tối thiểu <b>3</b> câu hỏi liên quan bài học. Nếu muốn hỏi thêm, bấm <b>＋</b>. AI sẽ đánh giá
                  chất lượng câu hỏi (0–2 điểm).
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {questions.map((q, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6, fontWeight: 900 }}>
                          Câu hỏi {idx + 1}
                        </div>
                        <textarea
                          value={q}
                          onChange={(e) => updateQuestionRow(idx, e.target.value)}
                          placeholder={`Nhập câu hỏi ${idx + 1}...`}
                          rows={3}
                          style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid var(--input-border)",
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                            padding: 12,
                            outline: "none",
                            fontSize: 14,
                            lineHeight: 1.7,
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => removeQuestionRow(idx)}
                          style={{
                            ...btnGhost,
                            cursor: questions.length > 3 ? "pointer" : "not-allowed",
                            opacity: questions.length > 3 ? 1 : 0.4,
                          }}
                          disabled={questions.length <= 3}
                          title={questions.length <= 3 ? "Tối thiểu 3 câu hỏi" : "Xoá dòng này"}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {questionsErr && (
                  <pre style={{ marginTop: 10, color: "var(--danger)", whiteSpace: "pre-wrap" }}>{questionsErr}</pre>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleEvaluateQuestions}
                    style={{ ...btnPrimary, opacity: questionsLoading ? 0.7 : 1 }}
                    disabled={questionsLoading}
                  >
                    {questionsLoading ? "Đánh giá câu hỏi..." : "Submit prelearning →"}
                  </button>

                  <button type="button" onClick={() => setStep(2)} style={btnGhost}>
                    ← Back to quiz
                  </button>
                </div>
              </>
            )}

            {/* Step 4 */}
            {step === 4 && (
              <>
                <div style={{ fontSize: 20, fontWeight: 950 }}>Done — Kết quả Pre-learning</div>

                <div style={{ marginTop: 12, color: "var(--text-muted)", lineHeight: 1.8, fontSize: 16 }}>
                  <div>
                    📄 Notebook: <b style={{ color: "var(--text-primary)" }}>{computedNotebookScore6}/6</b>
                  </div>
                  <div>
                    🧩 Quiz:{" "}
                    <b style={{ color: "var(--text-primary)" }}>
                      {computedQuizScore2}/2
                    </b>{" "}
                    ({quizCorrect}/{quizTotal})
                  </div>
                  <div>
                    ❓ Questions: <b style={{ color: "var(--text-primary)" }}>{computedQuestionsScore2}/2</b>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 18 }}>
                    👉 Total: <b style={{ color: "var(--text-primary)" }}>{computedTotal10}/10</b>
                  </div>
                </div>

                <div style={{ marginTop: 14, ...cardSoft }}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>{readiness.title}</div>
                  <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 15, lineHeight: 1.85 }}>
                    {readiness.body}
                  </div>

                  {notebookEval?.feedback?.length ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 950, marginBottom: 8, fontSize: 15 }}>Notebook feedback</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.85, color: "var(--text-muted)" }}>
                        {notebookEval.feedback.slice(0, 7).map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {quiz && quizAnswers.length > 0 ? (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 950, marginBottom: 8, fontSize: 15 }}>Quiz feedback</div>

                      {wrongQuizItems.length === 0 ? (
                        <div style={{ color: "var(--text-muted)", fontSize: 15, lineHeight: 1.85 }}>
                          ✅ Bạn làm đúng hết quiz. Rất tốt!
                        </div>
                      ) : (
                        <>
                          <div style={{ color: "var(--text-muted)", fontSize: 15, lineHeight: 1.85 }}>
                            Bạn sai <b style={{ color: "var(--text-primary)" }}>{wrongQuizItems.length}</b> câu.
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 950, marginBottom: 6, fontSize: 15 }}>👉 Bạn đang yếu ở:</div>

                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.85, color: "var(--text-muted)" }}>
                              {topWeakPoints.map((w, i) => (
                                <li key={i}>
                                  <b style={{ color: "var(--text-primary)" }}>{w.title}</b>. {w.tip}
                                  {w.example ? <span style={{ display: "block" }}>{w.example}</span> : null}
                                </li>
                              ))}
                            </ul>

                            <div style={{ marginTop: 14 }}>
                              <button
                                type="button"
                                onClick={() => setShowWrongDetails((v) => !v)}
                                style={btnGhost}
                                aria-expanded={showWrongDetails}
                              >
                                {showWrongDetails ? "Thu gọn chi tiết câu sai" : "Chi tiết câu sai (nếu bạn muốn xem)"}
                              </button>

                              {showWrongDetails && (
                                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                                  {wrongQuizItems.map(({ idx, q, selected, correct }) => {
                                    const selectedText = getChoiceTextSingle(q, selected);
                                    const correctText = getChoiceTextSingle(q, correct);
                                    const why = explainForWrong(q);

                                    return (
                                      <div key={`${q.id}-${idx}`} style={cardSoft}>
                                        <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.6 }}>
                                          Câu {idx + 1}: {q.instruction_vi}
                                          <div style={{ color: "var(--text-muted)", fontWeight: 750, marginTop: 4 }}>
                                            {q.instruction_en}
                                          </div>
                                        </div>

                                        <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.75 }}>
                                          {q.sentence_en}
                                        </div>

                                        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.75, color: "var(--text-muted)" }}>
                                          <div>
                                            ❌ Bạn chọn:{" "}
                                            <b style={{ color: "var(--text-primary)" }}>
                                              {letter(selected)}. {selectedText}
                                            </b>
                                          </div>
                                          <div style={{ marginTop: 4 }}>
                                            ✅ Đáp án đúng:{" "}
                                            <b style={{ color: "var(--text-primary)" }}>
                                              {letter(correct)}. {correctText}
                                            </b>
                                          </div>
                                          <div style={{ marginTop: 8 }}>👉 Vì sao: {why}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  {questionsEval?.feedback?.length || questionsEval?.notes?.length ? (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 950, marginBottom: 8, fontSize: 15 }}>Questions feedback</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.85, color: "var(--text-muted)" }}>
                        {(questionsEval.feedback ?? questionsEval.notes ?? []).slice(0, 7).map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {submitErr && (
                  <pre style={{ marginTop: 10, color: "var(--danger)", whiteSpace: "pre-wrap" }}>{submitErr}</pre>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    style={{ ...btnPrimary, opacity: submitLoading ? 0.7 : 1 }}
                    disabled={submitLoading}
                  >
                    {submitLoading ? "Saving..." : "Save to Dashboard"}
                  </button>

                  <button type="button" onClick={resetAll} style={btnGhost}>
                    Làm lại từ đầu (quiz mới)
                  </button>

                  <button type="button" onClick={() => router.push("/app")} style={btnGhost}>
                    Back to dashboard
                  </button>
                </div>

                {finalScore10 !== null && (
                  <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 15 }}>
                    ✅ Saved. Total score = <b style={{ color: "var(--text-primary)" }}>{finalScore10}/10</b>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Side panel */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 900 }}>Guidance</div>
            <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 900, marginBottom: 6, color: "var(--text-primary)" }}>Chấm Notebook (0–6)</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Đủ ý quan trọng theo slide/tutor (0–4)</li>
                <li>Trình bày rõ ràng, chữ dễ đọc (0–2)</li>
              </ul>

              <div style={{ fontWeight: 900, marginTop: 12, marginBottom: 6, color: "var(--text-primary)" }}>Quiz (0–2)</div>
              <div>Điểm = (đúng/tổng) × 2</div>

              <div style={{ fontWeight: 900, marginTop: 12, marginBottom: 6, color: "var(--text-primary)" }}>
                Questions (0–2)
              </div>
              <div>AI chấm mức độ cụ thể & liên quan bài học.</div>

              <div style={{ marginTop: 12, color: "var(--text-faint)" }}>
                Tip: Nếu score thấp, làm lại sẽ giúp tutor hiểu bạn đang thiếu gì và dạy đúng chỗ.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
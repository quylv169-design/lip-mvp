// app/student/practice/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRACTICE_BANK, THEORY_BANK } from "@/lib/practice/bank";
import type { PracticeLessonBank } from "@/lib/practice/types";

type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  order_index: number;
};

type SavedAttempt = {
  correct_count: number;
  total_count: number;
  pct: number;
  created_at: string;
};

type QuestionBankRow = {
  id: string;
  lesson_id: string;
  question_type: "theory" | "practice";
  question_text: string | null;
  options: unknown;
  answer_index: number | null;
  explanation_vi: string | null;
  is_active: boolean | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function shuffleArray<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stripLeadingQuestionNumber(text: string) {
  return text.replace(/^\s*\d+\)\s*/, "").trim();
}

function normalizeOptions(v: unknown): Array<{ text: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

/**
 * Create a "fresh attempt bank" where each question's choices are shuffled.
 * answerIndex is remapped to match the new order.
 * (Avoids students remembering A/B/C/D positions.)
 */
function buildAttemptBank(original: PracticeLessonBank): PracticeLessonBank {
  return {
    lessonId: original.lessonId,
    sections: original.sections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => {
        const indexed = q.choices.map((c, idx) => ({ c, idx }));
        const shuffled = shuffleArray(indexed);

        const newChoices = shuffled.map((x) => x.c);
        const newAnswerIndex = shuffled.findIndex((x) => x.idx === q.answerIndex);

        return {
          ...q,
          choices: newChoices,
          answerIndex: newAnswerIndex,
        };
      }),
    })),
  };
}

/**
 * Merge multiple lesson banks (e.g., THEORY + PRACTICE) into one bank for rendering.
 * - Keeps sections order: banks[] order, then their sections.
 * - Ensures section ids won't collide by prefixing.
 * - Assumes question ids are unique across banks (recommended).
 */
function mergeLessonBanks(
  lessonId: string,
  banks: Array<{ key: string; bank: PracticeLessonBank | null }>
): PracticeLessonBank | null {
  const parts = banks.filter((x) => x.bank && x.bank.sections?.length);
  if (!parts.length) return null;

  const mergedSections = parts.flatMap((p) =>
    (p.bank as PracticeLessonBank).sections.map((sec) => ({
      ...sec,
      id: `${p.key}:${sec.id}`, // avoid section id collision
      // keep questions unchanged (id should be unique globally)
    }))
  );

  return {
    lessonId,
    sections: mergedSections,
  };
}

function buildBankFromDbRows(
  lessonId: string,
  rows: QuestionBankRow[]
): PracticeLessonBank | null {
  const theoryRows = rows.filter(
    (r) => r.question_type === "theory" && r.is_active !== false
  );
  const practiceRows = rows.filter(
    (r) => r.question_type === "practice" && r.is_active !== false
  );

  const sections: PracticeLessonBank["sections"] = [];

  if (theoryRows.length > 0) {
    sections.push({
      id: "db-theory",
      titleVi: "Lý thuyết",
      titleEn: "Theory",
      questions: theoryRows
        .map((row, idx) => {
          const choices = normalizeOptions(row.options);
          const answerIndex =
            typeof row.answer_index === "number" ? row.answer_index : -1;
          const prompt = String(row.question_text ?? "").trim();

          if (!prompt || choices.length !== 4 || answerIndex < 0 || answerIndex > 3) {
            return null;
          }

          return {
            id: `db-theory-${row.id || idx + 1}`,
            prompt,
            choices,
            answerIndex,
            explainVi: String(row.explanation_vi ?? "").trim(),
          };
        })
        .filter(Boolean) as PracticeLessonBank["sections"][number]["questions"],
    });
  }

  if (practiceRows.length > 0) {
    sections.push({
      id: "db-practice",
      titleVi: "Thực hành",
      titleEn: "Practice",
      questions: practiceRows
        .map((row, idx) => {
          const choices = normalizeOptions(row.options);
          const answerIndex =
            typeof row.answer_index === "number" ? row.answer_index : -1;
          const prompt = String(row.question_text ?? "").trim();

          if (!prompt || choices.length !== 4 || answerIndex < 0 || answerIndex > 3) {
            return null;
          }

          return {
            id: `db-practice-${row.id || idx + 1}`,
            prompt,
            choices,
            answerIndex,
            explainVi: String(row.explanation_vi ?? "").trim(),
          };
        })
        .filter(Boolean) as PracticeLessonBank["sections"][number]["questions"],
    });
  }

  const cleanedSections = sections.filter((s) => s.questions.length > 0);

  if (!cleanedSections.length) return null;

  return {
    lessonId,
    sections: cleanedSections,
  };
}

/**
 * ✅ Next.js build (Vercel prerender) requires useSearchParams() to be used
 * inside a component wrapped by <Suspense />.
 */
export default function PracticePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading practice…</div>}>
      <PracticeInner />
    </Suspense>
  );
}

function PracticeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonIdFromUrl = (searchParams.get("lessonId") || "").trim();

  const [booting, setBooting] = useState(true);
  const [err, setErr] = useState("");

  const [userId, setUserId] = useState("");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");

  // answers: questionId -> chosenIndex
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  // Attempt bank (shuffled choices each reset/lesson change)
  const [attemptBank, setAttemptBank] = useState<PracticeLessonBank | null>(null);

  // DB-first bank
  const [dbBank, setDbBank] = useState<PracticeLessonBank | null>(null);
  const [dbBankLoading, setDbBankLoading] = useState(false);

  // ✅ Saved/locked attempt (first submission only)
  const [savedAttempt, setSavedAttempt] = useState<SavedAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // ✅ Submit guard message (when incomplete)
  const [guardMsg, setGuardMsg] = useState<string>("");

  // ✅ Force light theme (override any dark wrapper)
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "var(--bg-main)",
    color: "var(--text-primary)",
    padding: 18,
  };

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 1700,
    margin: "0 auto",
  };

  // --------- Load session + lessons ----------
  useEffect(() => {
    (async () => {
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

      // Lấy danh sách class mà học sinh đang học
      const { data: memberships, error: memErr } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", uid);

      if (memErr) {
        setErr(memErr.message);
        setBooting(false);
        return;
      }

      const classIds = (memberships ?? [])
        .map((m: any) => String(m.class_id))
        .filter(Boolean);

      if (classIds.length === 0) {
        setLessons([]);
        setBooting(false);
        return;
      }

      // MVP: load tất cả lessons của các class mà học sinh tham gia
      const { data: lessonRows, error: lessonErr } = await supabase
        .from("lessons")
        .select("id,class_id,title,order_index")
        .in("class_id", classIds)
        .order("order_index", { ascending: true });

      if (lessonErr) {
        setErr(lessonErr.message);
        setLessons([]);
        setBooting(false);
        return;
      }

      const rows = (lessonRows as LessonRow[]) ?? [];
      setLessons(rows);

      // chọn lesson theo URL nếu có, nếu không thì lấy lesson đầu tiên
      const initial = rows.some((l) => l.id === lessonIdFromUrl)
        ? lessonIdFromUrl
        : rows[0]?.id || "";
      setSelectedLessonId(initial);

      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Khi đổi selectedLessonId -> sync lên URL (để share link & reload không mất)
  useEffect(() => {
    if (!selectedLessonId) return;
    const current = (searchParams.get("lessonId") || "").trim();
    if (current === selectedLessonId) return;

    const url = `/student/practice?lessonId=${encodeURIComponent(
      selectedLessonId
    )}`;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLessonId]);

  // Hard-code fallback bank gốc cho lesson hiện tại
  const fallbackMergedBank: PracticeLessonBank | null = useMemo(() => {
    if (!selectedLessonId) return null;

    const practice = PRACTICE_BANK[selectedLessonId] ?? null;
    const theory = THEORY_BANK[selectedLessonId] ?? null;

    return mergeLessonBanks(selectedLessonId, [
      { key: "theory", bank: theory },
      { key: "practice", bank: practice },
    ]);
  }, [selectedLessonId]);

  // Load DB bank for selected lesson
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDbBank(null);

      if (!selectedLessonId) return;

      setDbBankLoading(true);

      const { data, error } = await supabase
        .from("question_bank")
        .select(
          "id,lesson_id,question_type,question_text,options,answer_index,explanation_vi,is_active"
        )
        .eq("lesson_id", selectedLessonId)
        .in("question_type", ["theory", "practice"]);

      if (cancelled) return;

      if (error) {
        console.error("Load question_bank failed:", error.message);
        setDbBank(null);
        setDbBankLoading(false);
        return;
      }

      const rows = ((data as QuestionBankRow[]) ?? []).filter(Boolean);
      const built = buildBankFromDbRows(selectedLessonId, rows);
      setDbBank(built);
      setDbBankLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedLessonId]);

  // Final merged bank: DB first, hard-code fallback
  const mergedBank: PracticeLessonBank | null = useMemo(() => {
    if (dbBank) return dbBank;
    return fallbackMergedBank;
  }, [dbBank, fallbackMergedBank]);

  // Khi mergedBank đổi -> tạo attemptBank mới (shuffle choices) + reset attempt
  useEffect(() => {
    setGuardMsg("");
    setSaveMsg("");
    setSubmitted(false);
    setAnswers({});

    if (!mergedBank) {
      setAttemptBank(null);
      return;
    }

    setAttemptBank(buildAttemptBank(mergedBank));
  }, [mergedBank]);

  // ✅ Load locked score from DB for this lesson (if exists)
  useEffect(() => {
    (async () => {
      setSaveMsg("");
      setSavedAttempt(null);

      if (!userId || !selectedLessonId) return;

      const { data, error } = await supabase
        .from("practice_attempts")
        .select("correct_count,total_count,pct,created_at")
        .eq("student_id", userId)
        .eq("lesson_id", selectedLessonId)
        .maybeSingle();

      if (error) {
        console.error(error);
        return;
      }

      if (data) {
        setSavedAttempt({
          correct_count: data.correct_count,
          total_count: data.total_count,
          pct: data.pct,
          created_at: data.created_at,
        });
      }
    })();
  }, [userId, selectedLessonId]);

  // Title
  const lessonTitle = useMemo(() => {
    const row = lessons.find((l) => l.id === selectedLessonId);
    if (!row) return "";
    return row.title;
  }, [lessons, selectedLessonId]);

  // Must be above early returns
  const selectedLessonLabel = useMemo(() => {
    const row = lessons.find((l) => l.id === selectedLessonId);
    if (!row) return "Chọn lesson…";
    return `Lesson ${row.order_index}: ${row.title}`;
  }, [lessons, selectedLessonId]);

  const usingDbBank = !!dbBank;

  const totalQuestions = useMemo(() => {
    if (!attemptBank) return 0;
    return attemptBank.sections.reduce((sum, s) => sum + s.questions.length, 0);
  }, [attemptBank]);

  const answeredCount = useMemo(() => {
    if (!attemptBank) return 0;
    let done = 0;
    for (const sec of attemptBank.sections) {
      for (const q of sec.questions) {
        const chosen = answers[q.id];
        if (typeof chosen === "number") done += 1;
      }
    }
    return done;
  }, [attemptBank, answers]);

  const remainingCount = useMemo(() => {
    return Math.max(0, totalQuestions - answeredCount);
  }, [totalQuestions, answeredCount]);

  const scoreVM = useMemo(() => {
    if (!attemptBank) return { correct: 0, total: 0, pct: 0 };

    let correct = 0;
    let total = 0;

    for (const sec of attemptBank.sections) {
      for (const q of sec.questions) {
        total += 1;
        const chosen = answers[q.id];
        if (typeof chosen === "number" && chosen === q.answerIndex) correct += 1;
      }
    }

    const pct = total ? Math.round((correct / total) * 100) : 0;
    return { correct, total, pct };
  }, [attemptBank, answers]);

  const questionNumberMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!attemptBank) return map;

    let counter = 1;
    for (const sec of attemptBank.sections) {
      for (const q of sec.questions) {
        map[q.id] = counter;
        counter += 1;
      }
    }
    return map;
  }, [attemptBank]);

  // What to display as "năng lực đã chốt"
  const lockedScore = useMemo(() => {
    if (savedAttempt) {
      return {
        correct: savedAttempt.correct_count,
        total: savedAttempt.total_count,
        pct: savedAttempt.pct,
        locked: true as const,
      };
    }
    if (submitted) {
      return {
        correct: scoreVM.correct,
        total: scoreVM.total,
        pct: scoreVM.pct,
        locked: false as const,
      };
    }
    return null;
  }, [savedAttempt, submitted, scoreVM.correct, scoreVM.total, scoreVM.pct]);

  function resetAttempt() {
    setGuardMsg("");
    setSaveMsg("");
    setAnswers({});
    setSubmitted(false);
    if (mergedBank) setAttemptBank(buildAttemptBank(mergedBank)); // shuffle choices again
  }

  function onChoose(questionId: string, idx: number) {
    setGuardMsg("");
    setAnswers((prev) => ({ ...prev, [questionId]: clamp(idx, 0, 3) }));
    if (submitted) setSubmitted(false);
  }

  async function handleSubmit() {
    setGuardMsg("");
    setSaveMsg("");

    if (!attemptBank || !userId || !selectedLessonId) {
      setSubmitted(true);
      return;
    }

    // ✅ GUARD: must complete all questions
    if (answeredCount < totalQuestions) {
      setSubmitted(false);
      setGuardMsg(
        `Bạn mới làm được ${answeredCount}/${totalQuestions} câu. Hãy hoàn thành hết trước khi ấn Submit nhé.`
      );
      return;
    }

    setSubmitted(true);

    // If already locked in DB, do not change anything
    if (savedAttempt) {
      setSaveMsg(
        "✅ Điểm năng lực đã được chốt từ lần đầu. Bạn có thể làm lại để luyện tập."
      );
      return;
    }

    // Save first attempt only
    setSaving(true);
    try {
      const payload = {
        student_id: userId,
        lesson_id: selectedLessonId,
        correct_count: scoreVM.correct,
        total_count: scoreVM.total,
        pct: scoreVM.pct,
      };

      const { data, error } = await supabase
        .from("practice_attempts")
        .insert(payload)
        .select("correct_count,total_count,pct,created_at")
        .single();

      if (error) {
        const anyErr: any = error as any;
        if (anyErr?.code === "23505") {
          const { data: existing, error: fetchErr } = await supabase
            .from("practice_attempts")
            .select("correct_count,total_count,pct,created_at")
            .eq("student_id", userId)
            .eq("lesson_id", selectedLessonId)
            .maybeSingle();

          if (!fetchErr && existing) {
            setSavedAttempt({
              correct_count: existing.correct_count,
              total_count: existing.total_count,
              pct: existing.pct,
              created_at: existing.created_at,
            });
            setSaveMsg("✅ Điểm năng lực đã tồn tại từ lần trước (đã chốt).");
          } else {
            setSaveMsg(
              "⚠️ Không lưu được điểm (đã có điểm trước đó), nhưng không đọc lại được từ DB."
            );
          }
        } else {
          console.error(error);
          setSaveMsg(`⚠️ Lỗi lưu điểm: ${error.message}`);
        }
        return;
      }

      if (data) {
        setSavedAttempt({
          correct_count: data.correct_count,
          total_count: data.total_count,
          pct: data.pct,
          created_at: data.created_at,
        });
        setSaveMsg("✅ Đã chốt điểm năng lực lần đầu cho lesson này.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (booting) {
    return (
      <div
        style={{
          ...pageStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        Loading…
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ ...pageStyle, padding: 24 }}>
        <div style={{ color: "var(--danger)" }}>Error: {err}</div>
      </div>
    );
  }

  // Sticky summary style
  const stickyBox: React.CSSProperties = {
    position: "sticky",
    top: 12,
    alignSelf: "start",
    borderRadius: 14,
    border: `1px solid var(--border)`,
    background: "var(--bg-elev)",
    boxShadow: "var(--shadow)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 180,
  };

  const submitDisabled =
    !attemptBank ||
    totalQuestions === 0 ||
    saving ||
    answeredCount < totalQuestions;

  return (
    <div style={pageStyle}>
      {/* Wide container to use 1920px screens better */}
      <div style={containerStyle}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              Luyện tập / Practice
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Chọn lesson để luyện ngay trong trang này. Nếu vào từ Dashboard theo
              lesson X, trang sẽ tự mở đúng lesson X.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => router.push("/app")}
              style={{
                borderRadius: 10,
                padding: "10px 12px",
                border: `1px solid var(--btn-border)`,
                background: "var(--btn-bg)",
                cursor: "pointer",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              ← Back Dashboard
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "380px 1fr 280px",
            gap: 12,
            alignItems: "start",
          }}
          className="practiceGrid"
        >
          {/* Left: Lesson picker + summary */}
          <div
            style={{
              borderRadius: 14,
              border: `1px solid var(--border)`,
              background: "var(--bg-elev)",
              boxShadow: "var(--shadow)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 520,
            }}
          >
            <div style={{ fontWeight: 900 }}>Chọn lesson / Choose a lesson</div>

            {/* Button-like dropdown */}
            <div
              style={{
                position: "relative",
                borderRadius: 12,
                border: `1px solid var(--input-border)`,
                background: "var(--input-bg)",
                boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 12px",
                  gap: 10,
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={selectedLessonLabel}
                >
                  {selectedLessonLabel}
                </div>
                <div style={{ color: "var(--text-muted)", fontWeight: 900 }}>
                  ▾
                </div>
              </div>

              <select
                value={selectedLessonId}
                onChange={(e) => setSelectedLessonId(e.target.value)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  cursor: "pointer",
                }}
                aria-label="Select lesson"
              >
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    Lesson {l.order_index}: {l.title}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              Tip: Link sẽ giữ <b>lessonId</b> trên URL để bạn refresh vẫn không
              mất lesson đang luyện.
            </div>

            <div style={{ marginTop: 6, borderTop: `1px solid var(--border)`, paddingTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Kết quả / Result
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                Đã chọn:{" "}
                <b>
                  Lesson{" "}
                  {lessons.find((l) => l.id === selectedLessonId)?.order_index ??
                    "-"}
                  : {lessonTitle || "-"}
                </b>
                <br />
                Tổng câu: <b>{totalQuestions}</b>
                <br />
                Nguồn câu hỏi:{" "}
                <b>{usingDbBank ? "Supabase question_bank" : "Hard-code fallback"}</b>
                {dbBankLoading ? <> (đang kiểm tra DB...)</> : null}
              </div>

              {lockedScore ? (
                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 12,
                    border: `1px solid var(--border)`,
                    background: "var(--bg-soft)",
                    padding: 10,
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {lockedScore.locked ? (
                    <>
                      🔒 <b>Điểm năng lực (đã chốt)</b>:{" "}
                      <b>{lockedScore.correct}</b> / {lockedScore.total} (≈{" "}
                      <b>{lockedScore.pct}%</b>)
                    </>
                  ) : (
                    <>
                      ✅ <b>Kết quả lần làm này</b>:{" "}
                      <b>{lockedScore.correct}</b> / {lockedScore.total} (≈{" "}
                      <b>{lockedScore.pct}%</b>)
                      <div
                        style={{
                          marginTop: 6,
                          color: "var(--text-muted)",
                        }}
                      >
                        (Chưa chốt điểm năng lực. Bấm <b>Nộp bài</b> lần đầu sẽ
                        chốt vào hồ sơ.)
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  Làm xong rồi bấm <b>Nộp bài</b> để xem đáp án & giải thích.
                </div>
              )}

              {saveMsg ? (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {saveMsg}
                </div>
              ) : null}

              {guardMsg ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(220,38,38,0.25)",
                    background: "rgba(220,38,38,0.06)",
                    padding: 10,
                    fontSize: 12,
                    color: "var(--text-primary)",
                    lineHeight: 1.6,
                    fontWeight: 800,
                  }}
                >
                  {guardMsg}
                </div>
              ) : null}
            </div>

            <div
              style={{
                marginTop: "auto",
                fontSize: 11,
                color: "var(--text-faint)",
              }}
            >
              User: {userId ? `${userId.slice(0, 8)}…` : "-"}
            </div>
          </div>

          {/* Middle: Practice frame */}
          <div
            style={{
              borderRadius: 14,
              border: `1px solid var(--border)`,
              background: "var(--bg-elev)",
              boxShadow: "var(--shadow)",
              padding: 12,
              minHeight: 520,
              overflow: "hidden",
            }}
          >
            {!attemptBank ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
                Chưa có bài tập cho lesson này.
                <br />
                Trang này hiện chạy theo hướng:
                <br />
                - ưu tiên đọc từ <b>question_bank</b>
                <br />
                - nếu DB chưa có thì fallback về <b>lib/practice/bank.ts</b>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {attemptBank.sections.map((sec) => (
                  <div
                    key={sec.id}
                    style={{
                      borderRadius: 14,
                      border: `1px solid var(--border)`,
                      background: "var(--bg-soft)",
                      padding: 12,
                    }}
                  >
                    <div style={{ fontWeight: 950, color: "var(--text-primary)" }}>
                      {sec.titleVi}
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontWeight: 700,
                        }}
                      >
                        {" "}
                        — {sec.titleEn}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {sec.questions.map((q) => {
                        const chosen = answers[q.id];
                        const show = submitted;
                        const questionNo = questionNumberMap[q.id] ?? 0;
                        const promptText = stripLeadingQuestionNumber(q.prompt);

                        return (
                          <div
                            key={q.id}
                            style={{
                              borderRadius: 12,
                              border: `1px solid var(--border)`,
                              background: "var(--bg-elev)",
                              padding: 10,
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 800,
                                marginBottom: 8,
                                color: "var(--text-primary)",
                              }}
                            >
                              {questionNo}) {promptText}
                            </div>

                            <div style={{ display: "grid", gap: 8 }}>
                              {q.choices.map((c, idx) => {
                                const isChosen = chosen === idx;
                                const isCorrect = idx === q.answerIndex;

                                let border = `1px solid var(--border)`;
                                let bg = "var(--bg-elev)";

                                if (show) {
                                  if (isCorrect) {
                                    border =
                                      "1px solid rgba(34,197,94,0.40)";
                                    bg = "rgba(34,197,94,0.08)";
                                  } else if (isChosen && !isCorrect) {
                                    border =
                                      "1px solid rgba(220,38,38,0.35)";
                                    bg = "rgba(220,38,38,0.06)";
                                  }
                                } else if (isChosen) {
                                  border = `1px solid rgba(37,99,235,0.35)`;
                                  bg = "rgba(37,99,235,0.06)";
                                }

                                const showIcon = show && isChosen;
                                const icon = showIcon
                                  ? isCorrect
                                    ? "✅"
                                    : "❌"
                                  : "";

                                return (
                                  <button
                                    key={idx}
                                    onClick={() => onChoose(q.id, idx)}
                                    style={{
                                      textAlign: "left",
                                      borderRadius: 12,
                                      border,
                                      background: bg,
                                      padding: "10px 10px",
                                      cursor: "pointer",
                                      fontWeight: 700,
                                      color: "var(--text-primary)",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 22,
                                        display: "inline-flex",
                                        justifyContent: "center",
                                      }}
                                    >
                                      {showIcon
                                        ? icon
                                        : String.fromCharCode(65 + idx) + "."}
                                    </span>
                                    <span>{c.text}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Explain only after Submit */}
                            {submitted ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  borderRadius: 12,
                                  border: "1px solid rgba(245,158,11,0.35)",
                                  background: "rgba(245,158,11,0.10)",
                                  padding: "10px 10px",
                                  fontSize: 13,
                                  color: "var(--text-primary)",
                                  fontWeight: 800,
                                  lineHeight: 1.65,
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "flex-start",
                                }}
                              >
                                <span style={{ marginTop: 1 }}>💡</span>
                                <span>
                                  {(q as any).explainVi || "Chưa có giải thích."}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Bottom actions */}
                <div
                  style={{
                    borderRadius: 14,
                    border: `1px solid var(--border)`,
                    background: "var(--bg-soft)",
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {savedAttempt ? (
                      <>
                        🔒 Điểm năng lực (đã chốt):{" "}
                        <b>{savedAttempt.correct_count}</b> /{" "}
                        {savedAttempt.total_count} (≈{" "}
                        <b>{savedAttempt.pct}%</b>)
                      </>
                    ) : submitted ? (
                      <>
                        ✅ Kết quả lần làm này: <b>{scoreVM.correct}</b> /{" "}
                        {scoreVM.total} (≈ <b>{scoreVM.pct}%</b>)
                      </>
                    ) : (
                      <>
                        Đã làm: <b>{answeredCount}</b> / {totalQuestions} câu{" "}
                        {remainingCount > 0 ? (
                          <span>
                            • còn thiếu <b>{remainingCount}</b> câu
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={handleSubmit}
                      disabled={submitDisabled}
                      style={{
                        borderRadius: 10,
                        padding: "10px 12px",
                        border: `1px solid var(--btn-primary-border)`,
                        background: "var(--btn-primary-bg)",
                        cursor: submitDisabled ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        color: "var(--text-primary)",
                        opacity: saving ? 0.8 : submitDisabled ? 0.55 : 1,
                      }}
                      title={
                        submitDisabled && remainingCount > 0
                          ? `Bạn mới làm ${answeredCount}/${totalQuestions} câu`
                          : undefined
                      }
                    >
                      {saving ? "Đang lưu..." : "Nộp bài / Submit"}
                    </button>

                    <button
                      onClick={resetAttempt}
                      style={{
                        borderRadius: 10,
                        padding: "10px 12px",
                        border: `1px solid var(--btn-border)`,
                        background: "var(--btn-bg)",
                        cursor: "pointer",
                        fontWeight: 800,
                        color: "var(--text-primary)",
                      }}
                    >
                      Làm lại / Reset (xáo đáp án)
                    </button>
                  </div>
                </div>

                {guardMsg ? (
                  <div
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(220,38,38,0.25)",
                      background: "rgba(220,38,38,0.06)",
                      padding: 10,
                      fontSize: 12,
                      color: "var(--text-primary)",
                      lineHeight: 1.6,
                      fontWeight: 800,
                    }}
                  >
                    {guardMsg}
                  </div>
                ) : null}

                {saveMsg ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    {saveMsg}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Right: Sticky progress panel */}
          <div style={stickyBox} className="stickyPanel">
            <div style={{ fontWeight: 950 }}>Tiến độ làm bài</div>

            <div
              style={{
                borderRadius: 12,
                border: `1px solid var(--border)`,
                background: "var(--bg-soft)",
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
                color: "var(--text-primary)",
                lineHeight: 1.6,
              }}
            >
              <div>
                Đã làm: <b>{answeredCount}</b> / {totalQuestions} câu
              </div>
              <div>
                Còn thiếu: <b>{remainingCount}</b> câu
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {remainingCount > 0
                ? "Bạn cần làm đủ tất cả câu thì mới Submit được."
                : "OK rồi — bạn có thể Submit để xem đáp án & chốt điểm (lần đầu)."}
            </div>

            {guardMsg ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(220,38,38,0.25)",
                  background: "rgba(220,38,38,0.06)",
                  padding: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1.6,
                }}
              >
                {guardMsg}
              </div>
            ) : null}

            <div style={{ marginTop: "auto", fontSize: 11, color: "var(--text-faint)" }}>
              Tip: Reset sẽ xáo lại vị trí đáp án để tránh học “vị trí A/B/C/D”.
            </div>
          </div>
        </div>

        {/* Responsive */}
        <style jsx>{`
          @media (max-width: 1100px) {
            .practiceGrid {
              grid-template-columns: 1fr !important;
            }
            .stickyPanel {
              position: relative !important;
              top: auto !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
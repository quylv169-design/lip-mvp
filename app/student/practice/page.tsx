// app/student/practice/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRACTICE_BANK } from "@/lib/practice/bank";
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

  // ✅ Saved/locked attempt (first submission only)
  const [savedAttempt, setSavedAttempt] = useState<SavedAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // ✅ Force light theme (override any dark wrapper)
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "var(--bg-main)",
    color: "var(--text-primary)",
    padding: 18,
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

    const url = `/student/practice?lessonId=${encodeURIComponent(selectedLessonId)}`;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLessonId]);

  // Bank gốc cho lesson hiện tại
  const bank: PracticeLessonBank | null = useMemo(() => {
    if (!selectedLessonId) return null;
    return PRACTICE_BANK[selectedLessonId] ?? null;
  }, [selectedLessonId]);

  // Khi bank đổi (lesson đổi) -> tạo attemptBank mới (shuffle choices) + reset attempt
  useEffect(() => {
    if (!bank) {
      setAttemptBank(null);
      setAnswers({});
      setSubmitted(false);
      return;
    }
    setAttemptBank(buildAttemptBank(bank));
    setAnswers({});
    setSubmitted(false);
  }, [bank]);

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
        // Don't break page; just show a small message if needed
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

  // ✅ Fix duplicate "Lesson 1: Lesson 1: ..."
  const lessonTitle = useMemo(() => {
    const row = lessons.find((l) => l.id === selectedLessonId);
    if (!row) return "";
    return row.title;
  }, [lessons, selectedLessonId]);

  // ✅ Must be above early returns
  const selectedLessonLabel = useMemo(() => {
    const row = lessons.find((l) => l.id === selectedLessonId);
    if (!row) return "Chọn lesson…";
    return `Lesson ${row.order_index}: ${row.title}`;
  }, [lessons, selectedLessonId]);

  const totalQuestions = useMemo(() => {
    if (!attemptBank) return 0;
    return attemptBank.sections.reduce((sum, s) => sum + s.questions.length, 0);
  }, [attemptBank]);

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

  // ✅ What to display as "năng lực đã chốt"
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
    setAnswers({});
    setSubmitted(false);
    setSaveMsg("");
    if (bank) setAttemptBank(buildAttemptBank(bank)); // shuffle choices again
  }

  function onChoose(questionId: string, idx: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: clamp(idx, 0, 3) }));
    if (submitted) setSubmitted(false);
  }

  async function handleSubmit() {
    if (!attemptBank || !userId || !selectedLessonId) {
      setSubmitted(true);
      return;
    }

    setSubmitted(true);
    setSaveMsg("");

    // If already locked in DB, do not change anything
    if (savedAttempt) {
      setSaveMsg("✅ Điểm năng lực đã được chốt từ lần đầu. Bạn có thể làm lại để luyện tập.");
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
        // If unique constraint hit (already exists), fetch it and lock
        // Postgres unique violation: 23505
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
            setSaveMsg("⚠️ Không lưu được điểm (đã có điểm trước đó), nhưng không đọc lại được từ DB.");
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

  return (
    <div style={pageStyle}>
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
          <div style={{ fontSize: 18, fontWeight: 900 }}>Luyện tập / Practice</div>
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Chọn lesson để luyện ngay trong trang này. Nếu vào từ Dashboard theo lesson X, trang sẽ tự mở đúng lesson X.
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
          gridTemplateColumns: "380px 1fr",
          gap: 12,
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
              <div style={{ color: "var(--text-muted)", fontWeight: 900 }}>▾</div>
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

          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Tip: Link sẽ giữ <b>lessonId</b> trên URL để bạn refresh vẫn không mất lesson đang luyện.
          </div>

          <div style={{ marginTop: 6, borderTop: `1px solid var(--border)`, paddingTop: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Kết quả / Result</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Đã chọn:{" "}
              <b>
                Lesson {lessons.find((l) => l.id === selectedLessonId)?.order_index ?? "-"}: {lessonTitle || "-"}
              </b>
              <br />
              Tổng câu: <b>{totalQuestions}</b>
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
                    🔒 <b>Điểm năng lực (đã chốt)</b>: <b>{lockedScore.correct}</b> / {lockedScore.total} (≈{" "}
                    <b>{lockedScore.pct}%</b>)
                  </>
                ) : (
                  <>
                    ✅ <b>Kết quả lần làm này</b>: <b>{lockedScore.correct}</b> / {lockedScore.total} (≈{" "}
                    <b>{lockedScore.pct}%</b>)
                    <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
                      (Chưa chốt điểm năng lực. Bấm <b>Nộp bài</b> lần đầu sẽ chốt vào hồ sơ.)
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Làm xong kéo xuống cuối trang bên phải để <b>Nộp bài</b>.
              </div>
            )}

            {saveMsg ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                {saveMsg}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: "auto", fontSize: 11, color: "var(--text-faint)" }}>
            User: {userId ? `${userId.slice(0, 8)}…` : "-"}
          </div>
        </div>

        {/* Right: Practice frame */}
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
              Chưa có bài tập cho lesson này trong “bank”.
              <br />
              (MVP) Bạn có thể thêm bank theo lessonId trong file: <b>lib/practice/bank.ts</b>
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
                    <span style={{ color: "var(--text-muted)", fontWeight: 700 }}> — {sec.titleEn}</span>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                    {sec.questions.map((q) => {
                      const chosen = answers[q.id];
                      const show = submitted;

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
                          <div style={{ fontWeight: 800, marginBottom: 8, color: "var(--text-primary)" }}>
                            {q.prompt}
                          </div>

                          <div style={{ display: "grid", gap: 8 }}>
                            {q.choices.map((c, idx) => {
                              const isChosen = chosen === idx;
                              const isCorrect = idx === q.answerIndex;

                              let border = `1px solid var(--border)`;
                              let bg = "var(--bg-elev)";

                              if (show) {
                                if (isCorrect) {
                                  border = "1px solid rgba(34,197,94,0.40)";
                                  bg = "rgba(34,197,94,0.08)";
                                } else if (isChosen && !isCorrect) {
                                  border = "1px solid rgba(220,38,38,0.35)";
                                  bg = "rgba(220,38,38,0.06)";
                                }
                              } else if (isChosen) {
                                border = `1px solid rgba(37,99,235,0.35)`;
                                bg = "rgba(37,99,235,0.06)";
                              }

                              const showIcon = show && isChosen;
                              const icon = showIcon ? (isCorrect ? "✅" : "❌") : "";

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
                                  <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>
                                    {showIcon ? icon : String.fromCharCode(65 + idx) + "."}
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
                              <span>{(q as any).explainVi || "Chưa có giải thích."}</span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Bottom actions (Submit/Reset moved here) */}
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
                      🔒 Điểm năng lực (đã chốt): <b>{savedAttempt.correct_count}</b> / {savedAttempt.total_count} (≈{" "}
                      <b>{savedAttempt.pct}%</b>)
                    </>
                  ) : submitted ? (
                    <>
                      ✅ Kết quả lần làm này: <b>{scoreVM.correct}</b> / {scoreVM.total} (≈ <b>{scoreVM.pct}%</b>)
                    </>
                  ) : (
                    <>
                      Chọn đáp án cho từng câu, rồi bấm <b>Nộp bài</b> để xem đáp án & giải thích.
                    </>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={handleSubmit}
                    disabled={!attemptBank || totalQuestions === 0 || saving}
                    style={{
                      borderRadius: 10,
                      padding: "10px 12px",
                      border: `1px solid var(--btn-primary-border)`,
                      background: "var(--btn-primary-bg)",
                      cursor: attemptBank && totalQuestions && !saving ? "pointer" : "not-allowed",
                      fontWeight: 900,
                      color: "var(--text-primary)",
                      opacity: saving ? 0.8 : 1,
                    }}
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

              {saveMsg ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{saveMsg}</div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Responsive */}
      <style jsx>{`
        @media (max-width: 900px) {
          .practiceGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
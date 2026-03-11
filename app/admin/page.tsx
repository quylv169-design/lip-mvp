"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ClassRow = {
  id: string;
  name: string;
  tutor_id: string;
  created_at: string;
};

type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  order_index: number;
  slide_path: string | null;
  slide_updated_at: string | null;
};

type LessonDraft = {
  truthSource: string;
  prelearningJson: string;
  theoryJson: string;
  practiceJson: string;
};

type ImportedQuestionInput = {
  question_text?: string;
  instruction_vi?: string;
  instruction_en?: string;
  sentence_en?: string;
  options?: string[];
  answer_index?: number;
  explanation_vi?: string;
  skill_tag?: string;
  difficulty?: "easy" | "medium" | "hard";
  is_active?: boolean;
};

const UI_FONT =
  'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

const EMPTY_DRAFT: LessonDraft = {
  truthSource: "",
  prelearningJson: "",
  theoryJson: "",
  practiceJson: "",
};

export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, LessonDraft>>(
    {}
  );
  const [addingLesson, setAddingLesson] = useState(false);

  const [prelearningCounts, setPrelearningCounts] = useState<Record<string, number>>(
    {}
  );

  const [viewOpen, setViewOpen] = useState(false);
  const [viewTitle, setViewTitle] = useState<string>("");
  const [viewUpdatedAt, setViewUpdatedAt] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [cloneBusy, setCloneBusy] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  const templateClass = useMemo(
    () => classes.find((c) => c.name === "LIP-EL-001") ?? null,
    [classes]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }
      setMeId(user.id);

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileErr || !profile) {
        router.replace("/app");
        return;
      }

      if (profile.role !== "admin") {
        router.replace("/app");
        return;
      }

      const { data: cls, error: clsErr } = await supabase
        .from("classes")
        .select("id,name,tutor_id,created_at")
        .order("created_at", { ascending: false });

      if (clsErr) {
        setMsg("Load classes lỗi: " + clsErr.message);
        setLoading(false);
        return;
      }

      const list = (cls as ClassRow[]) ?? [];
      setClasses(list);
      if (list.length > 0) setSelectedClassId(list[0].id);

      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    (async () => {
      if (!selectedClassId) {
        setLessons([]);
        setExpandedLessonId(null);
        setPrelearningCounts({});
        return;
      }
      setMsg("");

      const { data, error } = await supabase
        .from("lessons")
        .select("id,class_id,title,order_index,slide_path,slide_updated_at")
        .eq("class_id", selectedClassId)
        .order("order_index", { ascending: true });

      if (error) {
        setMsg("Load lessons lỗi: " + error.message);
        setLessons([]);
        return;
      }

      const nextLessons = (data as LessonRow[]) ?? [];
      setLessons(nextLessons);

      setLessonDrafts((prev) => {
        const next = { ...prev };
        for (const lesson of nextLessons) {
          if (!next[lesson.id]) {
            next[lesson.id] = { ...EMPTY_DRAFT };
          }
        }
        return next;
      });

      const lessonIds = nextLessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        const { data: qbRows, error: qbErr } = await supabase
          .from("question_bank")
          .select("lesson_id")
          .in("lesson_id", lessonIds)
          .eq("question_type", "prelearning")
          .eq("is_active", true);

        if (!qbErr) {
          const counts: Record<string, number> = {};
          for (const lessonId of lessonIds) counts[lessonId] = 0;
          for (const row of (qbRows ?? []) as { lesson_id: string }[]) {
            counts[row.lesson_id] = (counts[row.lesson_id] ?? 0) + 1;
          }
          setPrelearningCounts(counts);
        } else {
          setPrelearningCounts({});
        }
      } else {
        setPrelearningCounts({});
      }

      if (nextLessons.length > 0 && !expandedLessonId) {
        setExpandedLessonId(nextLessons[0].id);
      }
    })();
  }, [selectedClassId, expandedLessonId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setViewOpen(false);
      }
    }
    if (viewOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewOpen]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function closeViewer() {
    setViewOpen(false);
    setViewUrl(null);
    setViewTitle("");
    setViewUpdatedAt(null);
    setViewLoading(false);
  }

  function getDraft(lessonId: string): LessonDraft {
    return lessonDrafts[lessonId] ?? { ...EMPTY_DRAFT };
  }

  function updateLessonDraft(
    lessonId: string,
    key: keyof LessonDraft,
    value: string
  ) {
    setLessonDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...(prev[lessonId] ?? { ...EMPTY_DRAFT }),
        [key]: value,
      },
    }));
  }

  function parseJsonArray(raw: string): { ok: true; items: unknown[] } | { ok: false; error: string } {
    const text = raw.trim();

    if (!text) {
      return { ok: false, error: "Nội dung đang trống." };
    }

    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        return { ok: false, error: "JSON phải là một array." };
      }
      return { ok: true, items: parsed as unknown[] };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `JSON không hợp lệ: ${detail}` };
    }
  }

  function validateJsonArray(raw: string, sectionLabel: string): boolean {
    const result = parseJsonArray(raw);
    if (!result.ok) {
      setMsg(`❌ ${sectionLabel}: ${result.error}`);
      return false;
    }
    setMsg(`✅ ${sectionLabel} hợp lệ. Tìm thấy ${result.items.length} item.`);
    return true;
  }

  function normalizeImportedQuestion(item: unknown, index: number): ImportedQuestionInput {
    const obj = (item ?? {}) as Record<string, unknown>;

    return {
      question_text:
        typeof obj.question_text === "string" ? obj.question_text.trim() : "",
      instruction_vi:
        typeof obj.instruction_vi === "string" ? obj.instruction_vi.trim() : "",
      instruction_en:
        typeof obj.instruction_en === "string" ? obj.instruction_en.trim() : "",
      sentence_en:
        typeof obj.sentence_en === "string" ? obj.sentence_en.trim() : "",
      options: Array.isArray(obj.options)
        ? obj.options.map((x) => String(x ?? "").trim())
        : [],
      answer_index:
        typeof obj.answer_index === "number"
          ? obj.answer_index
          : Number(obj.answer_index ?? -1),
      explanation_vi:
        typeof obj.explanation_vi === "string" ? obj.explanation_vi.trim() : "",
      skill_tag:
        typeof obj.skill_tag === "string" ? obj.skill_tag.trim() : `prelearning_skill_${index + 1}`,
      difficulty:
        obj.difficulty === "easy" || obj.difficulty === "medium" || obj.difficulty === "hard"
          ? obj.difficulty
          : "easy",
      is_active:
        typeof obj.is_active === "boolean" ? obj.is_active : true,
    };
  }

  function validateImportedQuestions(items: unknown[]): { ok: true; rows: ImportedQuestionInput[] } | { ok: false; error: string } {
    if (items.length === 0) {
      return { ok: false, error: "JSON array đang rỗng." };
    }

    const rows = items.map((item, index) => normalizeImportedQuestion(item, index));

    for (let i = 0; i < rows.length; i += 1) {
      const q = rows[i];
      const n = i + 1;
      const answerIndex = q.answer_index ?? -1;

      if (!q.question_text) {
        return { ok: false, error: `Câu ${n} thiếu question_text.` };
      }

      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return { ok: false, error: `Câu ${n} phải có đúng 4 options.` };
      }

      if (q.options.some((opt) => !opt || !opt.trim())) {
        return { ok: false, error: `Câu ${n} có option đang rỗng.` };
      }

      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
        return { ok: false, error: `Câu ${n} có answer_index không hợp lệ. Chỉ được 0–3.` };
      }

      if (!q.skill_tag) {
        return { ok: false, error: `Câu ${n} thiếu skill_tag.` };
      }
    }

    return { ok: true, rows };
  }

  function getContentSummary(lessonId: string) {
    const draft = getDraft(lessonId);

    const truthState = draft.truthSource.trim() ? "Filled" : "Empty";

    const prelearningState = (() => {
      const dbCount = prelearningCounts[lessonId] ?? 0;
      if (dbCount > 0) return `${dbCount} saved`;

      const raw = draft.prelearningJson.trim();
      if (!raw) return "Empty";
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? `${parsed.length} draft` : "Draft";
      } catch {
        return "Draft";
      }
    })();

    const theoryState = (() => {
      const raw = draft.theoryJson.trim();
      if (!raw) return "Empty";
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? `${parsed.length} items` : "Filled";
      } catch {
        return "Draft";
      }
    })();

    const practiceState = (() => {
      const raw = draft.practiceJson.trim();
      if (!raw) return "Empty";
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? `${parsed.length} items` : "Filled";
      } catch {
        return "Draft";
      }
    })();

    return {
      truthState,
      prelearningState,
      theoryState,
      practiceState,
    };
  }

  async function addLesson() {
    if (!selectedClassId) return;

    setAddingLesson(true);
    setMsg("");

    try {
      const nextOrder =
        lessons.length > 0
          ? Math.max(...lessons.map((l) => l.order_index)) + 1
          : 1;

      const defaultTitle = `Lesson ${nextOrder}`;

      const { data, error } = await supabase
        .from("lessons")
        .insert({
          class_id: selectedClassId,
          title: defaultTitle,
          order_index: nextOrder,
        })
        .select("id,class_id,title,order_index,slide_path,slide_updated_at")
        .single();

      if (error || !data) {
        setMsg("Tạo lesson lỗi: " + (error?.message ?? "unknown"));
        return;
      }

      const newLesson = data as LessonRow;
      const nextLessons = [...lessons, newLesson].sort(
        (a, b) => a.order_index - b.order_index
      );

      setLessons(nextLessons);
      setLessonDrafts((prev) => ({
        ...prev,
        [newLesson.id]: { ...EMPTY_DRAFT },
      }));
      setPrelearningCounts((prev) => ({ ...prev, [newLesson.id]: 0 }));
      setExpandedLessonId(newLesson.id);
      setMsg(`✅ Đã tạo lesson mới: ${newLesson.title}`);
    } finally {
      setAddingLesson(false);
    }
  }

  function toggleLessonRow(lessonId: string) {
    setExpandedLessonId((prev) => (prev === lessonId ? null : lessonId));
  }

  async function savePrelearningToSupabase(lesson: LessonRow) {
    const raw = getDraft(lesson.id).prelearningJson;
    const parsed = parseJsonArray(raw);
    if (!parsed.ok) {
      setMsg(`❌ ${lesson.title} — Prelearning Quiz: ${parsed.error}`);
      return;
    }

    const validated = validateImportedQuestions(parsed.items);
    if (!validated.ok) {
      setMsg(`❌ ${lesson.title} — Prelearning Quiz: ${validated.error}`);
      return;
    }

    setBusyLessonId(lesson.id);
    setMsg("");

    try {
      const rows = validated.rows.map((q) => ({
        lesson_id: lesson.id,
        question_type: "prelearning",
        question_text: q.question_text ?? "",
        instruction_vi: q.instruction_vi ?? "",
        instruction_en: q.instruction_en ?? "",
        sentence_en: q.sentence_en ?? "",
        options: q.options ?? [],
        answer_index: q.answer_index ?? 0,
        explanation_vi: q.explanation_vi ?? "",
        skill_tag: q.skill_tag ?? "",
        difficulty: q.difficulty ?? "easy",
        is_active: q.is_active ?? true,
      }));

      const { error: deleteErr } = await supabase
        .from("question_bank")
        .delete()
        .eq("lesson_id", lesson.id)
        .eq("question_type", "prelearning");

      if (deleteErr) {
        setMsg(`❌ ${lesson.title} — Xóa prelearning cũ lỗi: ${deleteErr.message}`);
        return;
      }

      const { error: insertErr } = await supabase
        .from("question_bank")
        .insert(rows);

      if (insertErr) {
        setMsg(`❌ ${lesson.title} — Save prelearning lỗi: ${insertErr.message}`);
        return;
      }

      setPrelearningCounts((prev) => ({
        ...prev,
        [lesson.id]: rows.filter((r) => r.is_active).length,
      }));

      setMsg(
        `✅ ${lesson.title} — Đã lưu ${rows.length} câu prelearning vào question_bank.`
      );
    } finally {
      setBusyLessonId(null);
    }
  }

  function saveSectionDraft(
    lesson: LessonRow,
    section: "truthSource" | "prelearningJson" | "theoryJson" | "practiceJson"
  ) {
    const draft = getDraft(lesson.id);

    if (section === "truthSource") {
      if (!draft.truthSource.trim()) {
        setMsg(`⚠️ ${lesson.title} — Truth Source đang trống.`);
        return;
      }
      setMsg(
        `ℹ️ ${lesson.title} — UI đã sẵn cho Truth Source.\nHiện phần này mới lưu draft trên màn hình, chưa save xuống Supabase vì bạn chưa tạo bảng content bank.`
      );
      return;
    }

    if (section === "prelearningJson") {
      void savePrelearningToSupabase(lesson);
      return;
    }

    if (section === "theoryJson") {
      if (!validateJsonArray(draft.theoryJson, `${lesson.title} — Theory Questions`)) {
        return;
      }
      setMsg(
        `ℹ️ ${lesson.title} — Theory Questions JSON hợp lệ.\nHiện mới validate ở UI, chưa import xuống Supabase.`
      );
      return;
    }

    if (section === "practiceJson") {
      if (!validateJsonArray(draft.practiceJson, `${lesson.title} — Practice Questions`)) {
        return;
      }
      setMsg(
        `ℹ️ ${lesson.title} — Practice Questions JSON hợp lệ.\nHiện mới validate ở UI, chưa import xuống Supabase.`
      );
      return;
    }
  }

  async function openSlideViewer(lesson: LessonRow) {
    if (!lesson.slide_path) {
      setMsg("Lesson này chưa có slide_path để xem.");
      return;
    }

    setMsg("");
    setViewOpen(true);
    setViewTitle(`${lesson.title} — Slide`);
    setViewUpdatedAt(lesson.slide_updated_at ?? null);
    setViewUrl(null);
    setViewLoading(true);

    try {
      const { data, error } = await supabase.storage
        .from("slides")
        .createSignedUrl(lesson.slide_path, 60 * 10);

      if (error || !data?.signedUrl) {
        setMsg("Tạo signed URL lỗi: " + (error?.message ?? "unknown"));
        closeViewer();
        return;
      }

      setViewUrl(data.signedUrl);
    } finally {
      setViewLoading(false);
    }
  }

  async function openSlideNewTab(lesson: LessonRow) {
    if (!lesson.slide_path) {
      setMsg("Lesson này chưa có slide_path để mở.");
      return;
    }

    setMsg("");

    const { data, error } = await supabase.storage
      .from("slides")
      .createSignedUrl(lesson.slide_path, 60 * 10);

    if (error || !data?.signedUrl) {
      setMsg("Tạo signed URL lỗi: " + (error?.message ?? "unknown"));
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function uploadSlide(lesson: LessonRow, file: File) {
    if (!selectedClassId) return;
    if (!meId) return;

    setBusyLessonId(lesson.id);
    setMsg("");

    try {
      const ext = (() => {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".pptx")) return "pptx";
        if (lower.endsWith(".ppt")) return "ppt";
        return "pdf";
      })();

      const path = `class_${selectedClassId}/lesson_${lesson.id}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("slides")
        .upload(path, file, {
          upsert: true,
          contentType: file.type || undefined,
        });

      if (upErr) {
        setMsg("Upload lên Storage lỗi: " + upErr.message);
        return;
      }

      const nowIso = new Date().toISOString();

      const { error: dbErr } = await supabase
        .from("lessons")
        .update({
          slide_path: path,
          slide_updated_at: nowIso,
          slide_updated_by: meId,
        })
        .eq("id", lesson.id);

      if (dbErr) {
        setMsg("Update lessons.slide_path lỗi: " + dbErr.message);
        return;
      }

      setLessons((prev) =>
        prev.map((l) =>
          l.id === lesson.id
            ? { ...l, slide_path: path, slide_updated_at: nowIso }
            : l
        )
      );

      setMsg("✅ Upload thành công: " + path);
    } finally {
      setBusyLessonId(null);
    }
  }

  async function reloadSelectedClassLessons() {
    if (!selectedClassId) return;
    const { data, error } = await supabase
      .from("lessons")
      .select("id,class_id,title,order_index,slide_path,slide_updated_at")
      .eq("class_id", selectedClassId)
      .order("order_index", { ascending: true });

    if (error) {
      setMsg("Reload lessons lỗi: " + error.message);
      return;
    }
    setLessons((data as LessonRow[]) ?? []);
  }

  async function cloneFromTemplate() {
    if (!selectedClassId) return;
    if (!templateClass) {
      setMsg(
        "❌ Không tìm thấy class template tên 'LIP-EL-001'. Hãy tạo/đổi tên class template đúng."
      );
      return;
    }
    if (templateClass.id === selectedClassId) {
      setMsg(
        "ℹ️ Bạn đang chọn chính class template (LIP-EL-001). Không cần clone."
      );
      return;
    }

    const hasExisting = lessons.length > 0;
    if (hasExisting) {
      const ok = window.confirm(
        `Class "${selectedClass?.name ?? selectedClassId}" đã có ${lessons.length} lessons.\n\n` +
          `MVP clone sẽ XÓA lessons hiện tại của class này rồi copy y hệt lessons + slide_path từ "${templateClass.name}".\n\n` +
          `Bạn chắc chắn muốn tiếp tục?`
      );
      if (!ok) return;
    }

    setCloneBusy(true);
    setMsg("");

    try {
      const { data: tplLessons, error: tplErr } = await supabase
        .from("lessons")
        .select("id,class_id,title,order_index,slide_path,slide_updated_at")
        .eq("class_id", templateClass.id)
        .order("order_index", { ascending: true });

      if (tplErr) {
        setMsg("❌ Load template lessons lỗi: " + tplErr.message);
        return;
      }

      const templateList = (tplLessons as LessonRow[]) ?? [];
      if (templateList.length === 0) {
        setMsg("❌ Template class 'LIP-EL-001' chưa có lesson nào để clone.");
        return;
      }

      if (hasExisting) {
        const { error: delErr } = await supabase
          .from("lessons")
          .delete()
          .eq("class_id", selectedClassId);
        if (delErr) {
          setMsg("❌ Xóa lessons hiện tại của class lỗi: " + delErr.message);
          return;
        }
      }

      const insertRows = templateList.map((l) => ({
        class_id: selectedClassId,
        title: l.title,
        order_index: l.order_index,
        slide_path: l.slide_path,
        slide_updated_at: l.slide_updated_at,
      }));

      const { error: insErr } = await supabase
        .from("lessons")
        .insert(insertRows);
      if (insErr) {
        setMsg("❌ Insert cloned lessons lỗi: " + insErr.message);
        return;
      }

      await reloadSelectedClassLessons();
      setExpandedLessonId(null);
      setMsg(
        `✅ Clone thành công!\n` +
          `Nguồn: ${templateClass.name}\n` +
          `Đích: ${selectedClass?.name ?? selectedClassId}\n` +
          `Đã copy ${insertRows.length} lessons + slide_path.\n\n` +
          `Tutor vào live class sẽ Present được ngay giống LIP-EL-001.`
      );
    } finally {
      setCloneBusy(false);
    }
  }

  function sectionCard(
    title: string,
    subtitle: string,
    children: React.ReactNode
  ) {
    return (
      <div
        style={{
          border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.82)",
          boxShadow: "var(--shadow-sm)",
          borderRadius: 16,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 900, color: "var(--foreground)" }}>{title}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-strong)",
            marginTop: 4,
          }}
        >
          {subtitle}
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    );
  }

  const secondaryButtonStyle: React.CSSProperties = {
    height: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid var(--border-strong)",
    background: "linear-gradient(180deg, #ffffff 0%, #f7faff 100%)",
    color: "var(--foreground)",
    cursor: "pointer",
    fontWeight: 800,
    boxShadow: "var(--button-secondary-shadow)",
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: UI_FONT,
          color: "var(--foreground)",
          background:
            "radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 28%), linear-gradient(180deg, #f4f8fc 0%, var(--background) 22%, #ecf2f8 100%)",
        }}
      >
        Loading admin…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: UI_FONT,
        padding: 20,
        background:
          "radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 28%), linear-gradient(180deg, #f4f8fc 0%, var(--background) 22%, #ecf2f8 100%)",
        color: "var(--foreground)",
      }}
    >
      {viewOpen ? (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeViewer();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.38)",
            display: "grid",
            placeItems: "center",
            padding: 14,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: "min(1200px, 96vw)",
              height: "min(820px, 92vh)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                borderBottom: "1px solid var(--border)",
                background: "rgba(255,255,255,0.78)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "var(--foreground)",
                  }}
                >
                  {viewTitle}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginTop: 2,
                  }}
                >
                  Updated: {viewUpdatedAt ?? "—"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {viewUrl ? (
                  <button
                    onClick={() =>
                      window.open(viewUrl, "_blank", "noopener,noreferrer")
                    }
                    style={secondaryButtonStyle}
                  >
                    Open new tab
                  </button>
                ) : null}

                <button onClick={closeViewer} style={secondaryButtonStyle}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ flex: 1, position: "relative", background: "#ffffff" }}>
              {viewLoading ? (
                <div
                  style={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--muted-strong)",
                  }}
                >
                  Loading slide…
                </div>
              ) : viewUrl ? (
                <iframe
                  title="admin-slide-viewer"
                  src={viewUrl}
                  style={{ width: "100%", height: "100%", border: 0 }}
                />
              ) : (
                <div
                  style={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--muted-strong)",
                  }}
                >
                  Không có URL để hiển thị.
                </div>
              )}

              {viewUrl && viewTitle ? (
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    bottom: 12,
                    fontSize: 12,
                    color: "var(--foreground)",
                    background: "rgba(255,255,255,0.92)",
                    border: "1px solid var(--border)",
                    padding: "6px 10px",
                    borderRadius: 10,
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  Tip: PDF sẽ xem trực tiếp. PPT/PPTX có thể tải xuống tuỳ trình
                  duyệt.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "var(--foreground)",
            }}
          >
            🛠️ Admin Dashboard
          </div>
          <div
            style={{
              color: "var(--muted-strong)",
              marginTop: 4,
            }}
          >
            Quản lý lesson theo dạng accordion. Slide đã save thật, prelearning đã save thật vào question_bank.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => router.push("/app")}
            style={secondaryButtonStyle}
          >
            ← App
          </button>

          <button onClick={logout} style={secondaryButtonStyle}>
            Logout
          </button>
        </div>
      </div>

      {msg ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "rgba(255,255,255,0.86)",
            color: "var(--foreground)",
            whiteSpace: "pre-wrap",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {msg}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 16,
        }}
      >
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 18,
            background: "rgba(255,255,255,0.84)",
            padding: 12,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: 10,
              color: "var(--foreground)",
            }}
          >
            Classes
          </div>

          {classes.length === 0 ? (
            <div style={{ color: "var(--muted-strong)" }}>Chưa có class nào.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {classes.map((c) => {
                const active = c.id === selectedClassId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClassId(c.id)}
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      borderRadius: 14,
                      border: active
                        ? "1px solid rgba(59,130,246,0.35)"
                        : "1px solid var(--border)",
                      background: active
                        ? "rgba(59,130,246,0.10)"
                        : "rgba(255,255,255,0.82)",
                      color: "var(--foreground)",
                      cursor: "pointer",
                      boxShadow: active ? "var(--shadow-sm)" : "none",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{c.name}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 2,
                      }}
                    >
                      {c.id}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 18,
            background: "rgba(255,255,255,0.84)",
            padding: 12,
            minHeight: 240,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, color: "var(--foreground)" }}>
                Lessons
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginTop: 2,
                }}
              >
                Class:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {selectedClass?.name ?? "—"}
                </span>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  disabled={addingLesson || !selectedClassId}
                  onClick={addLesson}
                  style={{
                    ...secondaryButtonStyle,
                    cursor:
                      addingLesson || !selectedClassId ? "not-allowed" : "pointer",
                    opacity: addingLesson || !selectedClassId ? 0.55 : 1,
                  }}
                >
                  {addingLesson ? "Adding…" : "+ Add Lesson"}
                </button>

                <button
                  disabled={
                    cloneBusy ||
                    !templateClass ||
                    !selectedClassId ||
                    templateClass?.id === selectedClassId ||
                    classes.length === 0
                  }
                  onClick={cloneFromTemplate}
                  style={{
                    ...secondaryButtonStyle,
                    cursor:
                      cloneBusy ||
                      !templateClass ||
                      !selectedClassId ||
                      templateClass?.id === selectedClassId ||
                      classes.length === 0
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      cloneBusy ||
                      !templateClass ||
                      !selectedClassId ||
                      templateClass?.id === selectedClassId ||
                      classes.length === 0
                        ? 0.55
                        : 1,
                  }}
                >
                  {cloneBusy
                    ? "Cloning…"
                    : `📌 Clone from ${templateClass?.name ?? "LIP-EL-001"} (include slides)`}
                </button>
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                {templateClass ? (
                  <>
                    Template ID:{" "}
                    <span style={{ color: "var(--foreground)" }}>
                      {templateClass.id}
                    </span>
                  </>
                ) : (
                  <>⚠️ Không tìm thấy class template tên “LIP-EL-001”.</>
                )}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Path format: <code>class_{"<classId>"}/lesson_{"<lessonId>"}.pdf</code>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {lessons.length === 0 ? (
              <div style={{ color: "var(--muted-strong)" }}>
                (Chưa có lesson nào trong class này)
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {lessons.map((l) => {
                  const busy = busyLessonId === l.id;
                  const hasSlide = !!l.slide_path;
                  const expanded = expandedLessonId === l.id;
                  const summary = getContentSummary(l.id);

                  return (
                    <div
                      key={l.id}
                      style={{
                        border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.82)",
                        borderRadius: 16,
                        overflow: "hidden",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <button
                        onClick={() => toggleLessonRow(l.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          color: "var(--foreground)",
                          border: "none",
                          padding: 14,
                          cursor: "pointer",
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 14,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 18 }}>
                            #{l.order_index} — {l.title}
                          </div>

                          <div
                            style={{
                              marginTop: 8,
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              fontSize: 12,
                            }}
                          >
                            {[
                              `Slide: ${hasSlide ? "Uploaded" : "Empty"}`,
                              `Truth: ${summary.truthState}`,
                              `Prelearning: ${summary.prelearningState}`,
                              `Theory: ${summary.theoryState}`,
                              `Practice: ${summary.practiceState}`,
                            ].map((text) => (
                              <span
                                key={text}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  border: "1px solid var(--border)",
                                  background: "rgba(233,239,247,0.85)",
                                  color: "var(--muted-strong)",
                                  fontWeight: 600,
                                }}
                              >
                                {text}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div
                          style={{
                            minWidth: 44,
                            height: 44,
                            borderRadius: 12,
                            display: "grid",
                            placeItems: "center",
                            border: "1px solid var(--border)",
                            background:
                              "linear-gradient(180deg, #ffffff 0%, #f7faff 100%)",
                            fontSize: 22,
                            fontWeight: 900,
                            color: "var(--foreground)",
                            boxShadow: "var(--button-secondary-shadow)",
                          }}
                        >
                          {expanded ? "▾" : "▸"}
                        </div>
                      </button>

                      {expanded ? (
                        <div
                          style={{
                            borderTop: "1px solid var(--border)",
                            padding: 14,
                            display: "grid",
                            gap: 12,
                            background: "rgba(248,251,255,0.72)",
                          }}
                        >
                          {sectionCard(
                            "1) Slide",
                            "Upload / replace slide file for this lesson.",
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 320px",
                                gap: 12,
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--muted)",
                                  }}
                                >
                                  slide_path:{" "}
                                  <span style={{ color: "var(--foreground)" }}>
                                    {l.slide_path ?? "—"}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--muted)",
                                    marginTop: 2,
                                  }}
                                >
                                  updated_at:{" "}
                                  <span style={{ color: "var(--foreground)" }}>
                                    {l.slide_updated_at ?? "—"}
                                  </span>
                                </div>

                                <div
                                  style={{
                                    marginTop: 10,
                                    display: "flex",
                                    gap: 10,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <button
                                    disabled={!hasSlide}
                                    onClick={() => openSlideViewer(l)}
                                    style={{
                                      ...secondaryButtonStyle,
                                      cursor: hasSlide ? "pointer" : "not-allowed",
                                      opacity: hasSlide ? 1 : 0.55,
                                    }}
                                  >
                                    👁️ Xem slide
                                  </button>

                                  <button
                                    disabled={!hasSlide}
                                    onClick={() => openSlideNewTab(l)}
                                    style={{
                                      ...secondaryButtonStyle,
                                      cursor: hasSlide ? "pointer" : "not-allowed",
                                      opacity: hasSlide ? 1 : 0.55,
                                    }}
                                  >
                                    ↗ Open tab
                                  </button>
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                }}
                              >
                                <label
                                  style={{
                                    display: "block",
                                    border: "1px dashed var(--border-strong)",
                                    borderRadius: 14,
                                    padding: 10,
                                    cursor: busy ? "not-allowed" : "pointer",
                                    opacity: busy ? 0.6 : 1,
                                    background: "rgba(255,255,255,0.86)",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      marginBottom: 4,
                                      color: "var(--foreground)",
                                    }}
                                  >
                                    {l.slide_path ? "Replace slide" : "Upload slide"}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: "var(--muted)",
                                    }}
                                  >
                                    Chọn file PDF (khuyến nghị)
                                  </div>
                                  <input
                                    type="file"
                                    accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                    disabled={busy}
                                    style={{ display: "none" }}
                                    onChange={async (e) => {
                                      const f = e.target.files?.[0];
                                      e.currentTarget.value = "";
                                      if (!f) return;
                                      await uploadSlide(l, f);
                                    }}
                                  />
                                </label>

                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--muted)",
                                  }}
                                >
                                  Bucket: <b>slides</b>
                                  <br />
                                  Target:{" "}
                                  <code>{`class_${selectedClassId}/lesson_${l.id}.pdf`}</code>
                                </div>
                              </div>
                            </div>
                          )}

                          {sectionCard(
                            "2) Truth Source",
                            "Paste lesson knowledge text here. Chưa save thật xuống Supabase ở phiên bản này.",
                            <div>
                              <textarea
                                value={getDraft(l.id).truthSource}
                                onChange={(e) =>
                                  updateLessonDraft(
                                    l.id,
                                    "truthSource",
                                    e.target.value
                                  )
                                }
                                placeholder="Paste truth source / lesson notes here..."
                                style={{
                                  width: "100%",
                                  minHeight: 150,
                                  resize: "vertical",
                                  borderRadius: 14,
                                  border: "1px solid var(--border)",
                                  background: "rgba(255,255,255,0.94)",
                                  color: "var(--foreground)",
                                  padding: 12,
                                  fontFamily: UI_FONT,
                                  lineHeight: 1.5,
                                }}
                              />

                              <div
                                style={{
                                  marginTop: 10,
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  onClick={() => saveSectionDraft(l, "truthSource")}
                                  style={secondaryButtonStyle}
                                >
                                  Save Truth Source
                                </button>

                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--muted)",
                                  }}
                                >
                                  Draft only ở bản này.
                                </div>
                              </div>
                            </div>
                          )}

                          {sectionCard(
                            "3) Prelearning Quiz Import",
                            "Paste JSON array for prelearning question bank.",
                            <div>
                              <textarea
                                value={getDraft(l.id).prelearningJson}
                                onChange={(e) =>
                                  updateLessonDraft(
                                    l.id,
                                    "prelearningJson",
                                    e.target.value
                                  )
                                }
                                placeholder={`[\n  {\n    "question_text": "Choose the correct answer",\n    "instruction_vi": "Chọn đáp án đúng",\n    "instruction_en": "Choose the correct answer",\n    "sentence_en": "She ___ to school every day.",\n    "options": ["go", "goes", "going", "went"],\n    "answer_index": 1,\n    "explanation_vi": "Với she, động từ thêm -s/-es.",\n    "skill_tag": "present_simple_s_es",\n    "difficulty": "easy",\n    "is_active": true\n  }\n]`}
                                style={{
                                  width: "100%",
                                  minHeight: 180,
                                  resize: "vertical",
                                  borderRadius: 14,
                                  border: "1px solid var(--border)",
                                  background: "rgba(255,255,255,0.94)",
                                  color: "var(--foreground)",
                                  padding: 12,
                                  fontFamily:
                                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                  lineHeight: 1.5,
                                  fontSize: 13,
                                }}
                              />

                              <div
                                style={{
                                  marginTop: 10,
                                  fontSize: 12,
                                  color: "var(--muted)",
                                  lineHeight: 1.6,
                                }}
                              >
                                - Paste a JSON array
                                <br />
                                - Each item = 1 question
                                <br />
                                - Each question should have 4 options
                                <br />
                                - answer_index must be 0–3
                              </div>

                              <div
                                style={{
                                  marginTop: 10,
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  onClick={() =>
                                    validateJsonArray(
                                      getDraft(l.id).prelearningJson,
                                      `${l.title} — Prelearning Quiz`
                                    )
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    opacity: busy ? 0.55 : 1,
                                    cursor: busy ? "not-allowed" : "pointer",
                                  }}
                                  disabled={busy}
                                >
                                  Validate JSON
                                </button>

                                <button
                                  onClick={() =>
                                    saveSectionDraft(l, "prelearningJson")
                                  }
                                  style={{
                                    ...secondaryButtonStyle,
                                    opacity: busy ? 0.55 : 1,
                                    cursor: busy ? "not-allowed" : "pointer",
                                  }}
                                  disabled={busy}
                                >
                                  {busy ? "Saving..." : "Save Prelearning"}
                                </button>
                              </div>
                            </div>
                          )}

                          {sectionCard(
                            "4) Theory Questions Import",
                            "Paste JSON array for theory question bank.",
                            <div>
                              <textarea
                                value={getDraft(l.id).theoryJson}
                                onChange={(e) =>
                                  updateLessonDraft(l.id, "theoryJson", e.target.value)
                                }
                                placeholder={`[\n  {\n    "question_text": "Theory question...",\n    "options": ["A", "B", "C", "D"],\n    "answer_index": 0\n  }\n]`}
                                style={{
                                  width: "100%",
                                  minHeight: 180,
                                  resize: "vertical",
                                  borderRadius: 14,
                                  border: "1px solid var(--border)",
                                  background: "rgba(255,255,255,0.94)",
                                  color: "var(--foreground)",
                                  padding: 12,
                                  fontFamily:
                                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                  lineHeight: 1.5,
                                  fontSize: 13,
                                }}
                              />

                              <div
                                style={{
                                  marginTop: 10,
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  onClick={() =>
                                    validateJsonArray(
                                      getDraft(l.id).theoryJson,
                                      `${l.title} — Theory Questions`
                                    )
                                  }
                                  style={secondaryButtonStyle}
                                >
                                  Validate JSON
                                </button>

                                <button
                                  onClick={() => saveSectionDraft(l, "theoryJson")}
                                  style={secondaryButtonStyle}
                                >
                                  Save Theory
                                </button>
                              </div>
                            </div>
                          )}

                          {sectionCard(
                            "5) Practice Questions Import",
                            "Paste JSON array for practice question bank.",
                            <div>
                              <textarea
                                value={getDraft(l.id).practiceJson}
                                onChange={(e) =>
                                  updateLessonDraft(
                                    l.id,
                                    "practiceJson",
                                    e.target.value
                                  )
                                }
                                placeholder={`[\n  {\n    "question_text": "Practice question...",\n    "options": ["A", "B", "C", "D"],\n    "answer_index": 0\n  }\n]`}
                                style={{
                                  width: "100%",
                                  minHeight: 180,
                                  resize: "vertical",
                                  borderRadius: 14,
                                  border: "1px solid var(--border)",
                                  background: "rgba(255,255,255,0.94)",
                                  color: "var(--foreground)",
                                  padding: 12,
                                  fontFamily:
                                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                  lineHeight: 1.5,
                                  fontSize: 13,
                                }}
                              />

                              <div
                                style={{
                                  marginTop: 10,
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  onClick={() =>
                                    validateJsonArray(
                                      getDraft(l.id).practiceJson,
                                      `${l.title} — Practice Questions`
                                    )
                                  }
                                  style={secondaryButtonStyle}
                                >
                                  Validate JSON
                                </button>

                                <button
                                  onClick={() =>
                                    saveSectionDraft(l, "practiceJson")
                                  }
                                  style={secondaryButtonStyle}
                                >
                                  Save Practice
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.6,
        }}
      >
        Lưu ý: Nếu bạn đang dùng Storage policy “tutor-only write”, admin sẽ bị
        chặn upload.
        <br />
        Nếu upload báo permission denied, bạn cần sửa policy WRITE để cho phép
        role=admin.
        <br />
        Truth / Theory / Practice vẫn là UI draft. Prelearning đã save thật xuống question_bank.
      </div>
    </div>
  );
}
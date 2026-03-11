// app/admin/page.tsx
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

  // accordion
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, LessonDraft>>({});
  const [addingLesson, setAddingLesson] = useState(false);

  // ✅ Viewer state (Admin can view slide)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTitle, setViewTitle] = useState<string>("");
  const [viewUpdatedAt, setViewUpdatedAt] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // ✅ Clone/seed busy state
  const [cloneBusy, setCloneBusy] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  // ✅ Template class: LIP-EL-001 (MVP default)
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

      if (nextLessons.length > 0 && !expandedLessonId) {
        setExpandedLessonId(nextLessons[0].id);
      }
    })();
  }, [selectedClassId, expandedLessonId]);

  // ✅ Close viewer on ESC
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

  function getContentSummary(lessonId: string) {
    const draft = getDraft(lessonId);

    const truthState = draft.truthSource.trim() ? "Filled" : "Empty";

    const prelearningState = (() => {
      const raw = draft.prelearningJson.trim();
      if (!raw) return "Empty";
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? `${parsed.length} items` : "Filled";
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
      setExpandedLessonId(newLesson.id);
      setMsg(`✅ Đã tạo lesson mới: ${newLesson.title}`);
    } finally {
      setAddingLesson(false);
    }
  }

  function toggleLessonRow(lessonId: string) {
    setExpandedLessonId((prev) => (prev === lessonId ? null : lessonId));
  }

  function validateJsonArray(raw: string, sectionLabel: string): boolean {
    const text = raw.trim();

    if (!text) {
      setMsg(`⚠️ ${sectionLabel} đang trống.`);
      return false;
    }

    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setMsg(`❌ ${sectionLabel} phải là JSON array.`);
        return false;
      }
      setMsg(`✅ ${sectionLabel} hợp lệ. Tìm thấy ${parsed.length} item.`);
      return true;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setMsg(`❌ ${sectionLabel} không phải JSON hợp lệ.\n${detail}`);
      return false;
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
      if (!validateJsonArray(draft.prelearningJson, `${lesson.title} — Prelearning Quiz`)) {
        return;
      }
      setMsg(
        `ℹ️ ${lesson.title} — Prelearning Quiz JSON hợp lệ.\nHiện mới validate ở UI, chưa import xuống Supabase vì bạn chưa tạo bảng prelearning question bank.`
      );
      return;
    }

    if (section === "theoryJson") {
      if (!validateJsonArray(draft.theoryJson, `${lesson.title} — Theory Questions`)) {
        return;
      }
      setMsg(
        `ℹ️ ${lesson.title} — Theory Questions JSON hợp lệ.\nHiện mới validate ở UI, chưa import xuống Supabase vì bạn chưa tạo bảng theory question bank.`
      );
      return;
    }

    if (section === "practiceJson") {
      if (!validateJsonArray(draft.practiceJson, `${lesson.title} — Practice Questions`)) {
        return;
      }
      setMsg(
        `ℹ️ ${lesson.title} — Practice Questions JSON hợp lệ.\nHiện mới validate ở UI, chưa import xuống Supabase vì bạn chưa tạo bảng practice question bank.`
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
        .upload(path, file, { upsert: true, contentType: file.type || undefined });

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
          l.id === lesson.id ? { ...l, slide_path: path, slide_updated_at: nowIso } : l
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
      setMsg("❌ Không tìm thấy class template tên 'LIP-EL-001'. Hãy tạo/đổi tên class template đúng.");
      return;
    }
    if (templateClass.id === selectedClassId) {
      setMsg("ℹ️ Bạn đang chọn chính class template (LIP-EL-001). Không cần clone.");
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
        const { error: delErr } = await supabase.from("lessons").delete().eq("class_id", selectedClassId);
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

      const { error: insErr } = await supabase.from("lessons").insert(insertRows);
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
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{subtitle}</div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: UI_FONT,
        }}
      >
        Loading admin…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: UI_FONT, padding: 20, background: "#070707", color: "white" }}>
      {viewOpen ? (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeViewer();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
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
              background: "#0d0d0d",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
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
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {viewTitle}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Updated: {viewUpdatedAt ?? "—"}</div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {viewUrl ? (
                  <button
                    onClick={() => window.open(viewUrl, "_blank", "noopener,noreferrer")}
                    style={{
                      height: 34,
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    Open new tab
                  </button>
                ) : null}

                <button
                  onClick={closeViewer}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ flex: 1, position: "relative", background: "#000" }}>
              {viewLoading ? (
                <div style={{ height: "100%", display: "grid", placeItems: "center", opacity: 0.8 }}>Loading slide…</div>
              ) : viewUrl ? (
                <iframe title="admin-slide-viewer" src={viewUrl} style={{ width: "100%", height: "100%", border: 0 }} />
              ) : (
                <div style={{ height: "100%", display: "grid", placeItems: "center", opacity: 0.8 }}>
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
                    opacity: 0.75,
                    background: "rgba(0,0,0,0.55)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: "6px 10px",
                    borderRadius: 10,
                  }}
                >
                  Tip: PDF sẽ xem trực tiếp. PPT/PPTX có thể tải xuống tuỳ trình duyệt.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>🛠️ Admin Dashboard</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Quản lý lesson theo dạng accordion. Slide đã save thật, các content bank đang ở bước UI draft.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => router.push("/app")}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ← App
          </button>

          <button
            onClick={logout}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {msg ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      ) : null}

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Classes</div>

          {classes.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Chưa có class nào.</div>
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
                      borderRadius: 12,
                      border: active ? "1px solid rgba(120,170,255,0.5)" : "1px solid rgba(255,255,255,0.12)",
                      background: active ? "rgba(120,170,255,0.12)" : "rgba(0,0,0,0.25)",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{c.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{c.id}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            padding: 12,
            minHeight: 240,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Lessons</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                Class: <span style={{ opacity: 0.95 }}>{selectedClass?.name ?? "—"}</span>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  disabled={addingLesson || !selectedClassId}
                  onClick={addLesson}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: addingLesson || !selectedClassId ? "not-allowed" : "pointer",
                    fontWeight: 900,
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
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor:
                      cloneBusy ||
                      !templateClass ||
                      !selectedClassId ||
                      templateClass?.id === selectedClassId ||
                      classes.length === 0
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: 900,
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
                  {cloneBusy ? "Cloning…" : `📌 Clone from ${templateClass?.name ?? "LIP-EL-001"} (include slides)`}
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                {templateClass ? (
                  <>
                    Template ID: <span style={{ opacity: 0.95 }}>{templateClass.id}</span>
                  </>
                ) : (
                  <>⚠️ Không tìm thấy class template tên “LIP-EL-001”.</>
                )}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Path format: <code>class_{"<classId>"}/lesson_{"<lessonId>"}.pdf</code>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {lessons.length === 0 ? (
              <div style={{ opacity: 0.75 }}>(Chưa có lesson nào trong class này)</div>
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
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={() => toggleLessonRow(l.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          color: "white",
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
                              opacity: 0.88,
                            }}
                          >
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.04)",
                              }}
                            >
                              Slide: {hasSlide ? "Uploaded" : "Empty"}
                            </span>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.04)",
                              }}
                            >
                              Truth: {summary.truthState}
                            </span>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.04)",
                              }}
                            >
                              Prelearning: {summary.prelearningState}
                            </span>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.04)",
                              }}
                            >
                              Theory: {summary.theoryState}
                            </span>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.04)",
                              }}
                            >
                              Practice: {summary.practiceState}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            minWidth: 44,
                            height: 44,
                            borderRadius: 10,
                            display: "grid",
                            placeItems: "center",
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.04)",
                            fontSize: 22,
                            fontWeight: 900,
                          }}
                        >
                          {expanded ? "▾" : "▸"}
                        </div>
                      </button>

                      {expanded ? (
                        <div
                          style={{
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            padding: 14,
                            display: "grid",
                            gap: 12,
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
                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                  slide_path: <span style={{ opacity: 0.95 }}>{l.slide_path ?? "—"}</span>
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                                  updated_at: <span style={{ opacity: 0.9 }}>{l.slide_updated_at ?? "—"}</span>
                                </div>

                                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                  <button
                                    disabled={!hasSlide}
                                    onClick={() => openSlideViewer(l)}
                                    style={{
                                      height: 34,
                                      padding: "0 12px",
                                      borderRadius: 10,
                                      border: "1px solid rgba(255,255,255,0.18)",
                                      background: hasSlide ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                                      color: "white",
                                      cursor: hasSlide ? "pointer" : "not-allowed",
                                      fontWeight: 900,
                                      opacity: hasSlide ? 1 : 0.55,
                                    }}
                                  >
                                    👁️ Xem slide
                                  </button>

                                  <button
                                    disabled={!hasSlide}
                                    onClick={() => openSlideNewTab(l)}
                                    style={{
                                      height: 34,
                                      padding: "0 12px",
                                      borderRadius: 10,
                                      border: "1px solid rgba(255,255,255,0.18)",
                                      background: hasSlide ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                                      color: "white",
                                      cursor: hasSlide ? "pointer" : "not-allowed",
                                      fontWeight: 900,
                                      opacity: hasSlide ? 1 : 0.55,
                                    }}
                                  >
                                    ↗ Open tab
                                  </button>
                                </div>
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label
                                  style={{
                                    display: "block",
                                    border: "1px dashed rgba(255,255,255,0.18)",
                                    borderRadius: 12,
                                    padding: 10,
                                    cursor: busy ? "not-allowed" : "pointer",
                                    opacity: busy ? 0.6 : 1,
                                    background: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                                    {l.slide_path ? "Replace slide" : "Upload slide"}
                                  </div>
                                  <div style={{ fontSize: 12, opacity: 0.75 }}>Chọn file PDF (khuyến nghị)</div>
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

                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                  Bucket: <b>slides</b>
                                  <br />
                                  Target: <code>{`class_${selectedClassId}/lesson_${l.id}.pdf`}</code>
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
                                onChange={(e) => updateLessonDraft(l.id, "truthSource", e.target.value)}
                                placeholder="Paste truth source / lesson notes here..."
                                style={{
                                  width: "100%",
                                  minHeight: 150,
                                  resize: "vertical",
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: "rgba(0,0,0,0.24)",
                                  color: "white",
                                  padding: 12,
                                  fontFamily: UI_FONT,
                                  lineHeight: 1.5,
                                }}
                              />

                              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => saveSectionDraft(l, "truthSource")}
                                  style={{
                                    height: 34,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                  }}
                                >
                                  Save Truth Source
                                </button>

                                <div style={{ fontSize: 12, opacity: 0.75 }}>
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
                                onChange={(e) => updateLessonDraft(l.id, "prelearningJson", e.target.value)}
                                placeholder={`[\n  {\n    "question_text": "Choose the correct answer",\n    "options": ["A", "B", "C", "D"],\n    "answer_index": 0\n  }\n]`}
                                style={{
                                  width: "100%",
                                  minHeight: 180,
                                  resize: "vertical",
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: "rgba(0,0,0,0.24)",
                                  color: "white",
                                  padding: 12,
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                  lineHeight: 1.5,
                                  fontSize: 13,
                                }}
                              />

                              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
                                - Paste a JSON array
                                <br />
                                - Each item = 1 question
                                <br />
                                - Each question should have 4 options
                                <br />
                                - answer_index must be 0–3
                              </div>

                              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                  onClick={() =>
                                    validateJsonArray(getDraft(l.id).prelearningJson, `${l.title} — Prelearning Quiz`)
                                  }
                                  style={{
                                    height: 34,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                  }}
                                >
                                  Validate JSON
                                </button>

                                <button
                                  onClick={() => saveSectionDraft(l, "prelearningJson")}
                                  style={{
                                    height: 34,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                  }}
                                >
                                  Save Prelearning
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
                                onChange={(e) => updateLessonDraft(l.id, "theoryJson", e.target.value)}
                                placeholder={`[\n  {\n    "question_text": "Theory question...",\n    "options": ["A", "B", "C", "D"],\n    "answer_index": 0\n  }\n]`}
                                style={{
                                  width: "100%",
                                  minHeight: 180,
                                  resize: "vertical",
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: "rgba(0,0,0,0.24)",
                                  color: "white",
                                  padding: 12,
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                  lineHeight: 1.5,
                                  fontSize: 13,
                                }}
                              />

                              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                  onClick={() =>
                                    validateJsonArray(getDraft(l.id).theoryJson, `${l.title} — Theory Questions`)
                                  }
                                  style={{
                                    height: 34,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                  }}
                                >
                                  Validate JSON
                                </button>

                                <button
                                  onClick={() => saveSectionDraft(l, "theoryJson")}
                                  style={{
                                    height: 34,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                  }}
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
                                onChange={(e) => updateLessonDraft(l.id, "practiceJson", e.target.value)}
                                placeholder={`[\n  {\n    "question_text": "Practice question...",\n    "options": ["A", "B", "C", "D"],\n    "answer_index": 0\n  }\n]`}
                                style={{
                                  width: "100%",
                                  minHeight: 180,
                                  resize: "vertical",
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: "rgba(0,0,0,0.24)",
                                  color: "white",
                                  padding: 12,
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                  lineHeight: 1.5,
                                  fontSize: 13,
                                }}
                              />

                              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                  onClick={() =>
                                    validateJsonArray(getDraft(l.id).practiceJson, `${l.title} — Practice Questions`)
                                  }
                                  style={{
                                    height: 34,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                  }}
                                >
                                  Validate JSON
                                </button>

                                <button
                                  onClick={() => saveSectionDraft(l, "practiceJson")}
                                  style={{
                                    height: 34,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                  }}
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

      <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
        Lưu ý: Nếu bạn đang dùng Storage policy “tutor-only write”, admin sẽ bị chặn upload.
        <br />
        Nếu upload báo permission denied, bạn cần sửa policy WRITE để cho phép role=admin.
        <br />
        Các phần Truth / Prelearning / Theory / Practice hiện mới là UI draft để chốt workflow.
      </div>
    </div>
  );
}
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

const UI_FONT =
  'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId]
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

      setLessons((data as LessonRow[]) ?? []);
    })();
  }, [selectedClassId]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function uploadSlide(lesson: LessonRow, file: File) {
    if (!selectedClassId) return;
    if (!meId) return;

    setBusyLessonId(lesson.id);
    setMsg("");

    try {
      // ✅ Enforce format: class_<classId>/lesson_<lessonId>.pdf
      const ext = (() => {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".pptx")) return "pptx";
        if (lower.endsWith(".ppt")) return "ppt";
        return "pdf"; // fallback
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

      // refresh list quickly
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>🛠️ Admin Dashboard</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Upload slide bài giảng theo Lesson (bucket: slides)</div>
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
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Lessons</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                Class: <span style={{ opacity: 0.95 }}>{selectedClass?.name ?? "—"}</span>
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Path format: <code>class_{"<classId>"}/lesson_{"<lessonId>"}.pdf</code>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {lessons.length === 0 ? (
              <div style={{ opacity: 0.75 }}>(Chưa có lesson nào trong class này)</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {lessons.map((l) => {
                  const busy = busyLessonId === l.id;
                  return (
                    <div
                      key={l.id}
                      style={{
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        borderRadius: 12,
                        padding: 12,
                        display: "grid",
                        gridTemplateColumns: "1fr 280px",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          #{l.order_index} — {l.title}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                          slide_path: <span style={{ opacity: 0.95 }}>{l.slide_path ?? "—"}</span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                          updated_at: <span style={{ opacity: 0.9 }}>{l.slide_updated_at ?? "—"}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
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
                              e.currentTarget.value = ""; // allow reselect same file
                              if (!f) return;
                              await uploadSlide(l, f);
                            }}
                          />
                        </label>

                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Bucket: <b>slides</b> <br />
                          Target: <code>{`class_${selectedClassId}/lesson_${l.id}.pdf`}</code>
                        </div>
                      </div>
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
      </div>
    </div>
  );
}
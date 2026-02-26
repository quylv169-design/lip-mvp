"use client";

// app/student/class/[id]/page.tsx
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function StudentClassPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [className, setClassName] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const { data: sessionRes } = await supabase.auth.getSession();
      if (!sessionRes.session) {
        router.push("/login");
        return;
      }

      const { data: c, error } = await supabase
        .from("classes")
        .select("id,name")
        .eq("id", classId)
        .single();

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      setClassName(c?.name ?? "Class");
      setLoading(false);
    })();
  }, [classId, router]);

  if (loading) return <div style={{ padding: 20, opacity: 0.8 }}>Loading…</div>;
  if (err) return <div style={{ padding: 20, color: "#ffb4b4" }}>Error: {err}</div>;

  // Placeholder lessons (tạm)
  const lessons = [
    { id: "lesson-1", title: "Buổi 1 – Prelearning", desc: "Upload vở + Quiz + Questions" },
    { id: "lesson-2", title: "Buổi 2 – Prelearning", desc: "Bổ sung practice" },
    { id: "lesson-3", title: "Buổi 3 – Prelearning", desc: "Ôn tập + mini test" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Class</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{className}</div>
        </div>

        <Link
          href={`/class/${classId}`}
          style={{
            textDecoration: "none",
            color: "white",
            fontSize: 12,
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          Enter Live Class
        </Link>
      </div>

      <div style={{ fontSize: 12, opacity: 0.65 }}>
        Đây là khung. Tiếp theo mình sẽ thay placeholder bằng bảng <b>lessons</b> + <b>lesson_activities</b>.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {lessons.map((l) => (
          <div
            key={l.id}
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.02)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 900 }}>{l.title}</div>
            <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>{l.desc}</div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                onClick={() => alert("Bước tiếp theo: page lesson detail + activities")}
                style={{
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Open
              </button>

              <div
                style={{
                  height: 38,
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.25)",
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                Progress: 0%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
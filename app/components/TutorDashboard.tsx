// app/components/TutorDashboard.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ClassRow = {
  id: string;
  name: string;
  tutor_id: string;
  join_code: string | null;
  created_at: string;
};

export default function TutorDashboard() {
  const router = useRouter();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchClasses() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("classes")
      .select("id,name,tutor_id,join_code,created_at")
      .eq("tutor_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }
    setClasses((data as ClassRow[]) ?? []);
  }

  async function createClass() {
    const name = newClassName.trim();
    if (!name) return;

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;

    const { error } = await supabase.from("classes").insert({
      name,
      tutor_id: user.id,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setNewClassName("");
    await fetchClasses();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  useEffect(() => {
    (async () => {
      await fetchClasses();
      setLoading(false);
    })();
  }, []);

  if (loading) return <div>Loading tutor dashboard...</div>;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2>👨‍🏫 Tutor Dashboard</h2>
          <p>Quản lý lớp học bạn phụ trách.</p>
        </div>

        <button
          onClick={logout}
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
          title="Đăng xuất"
        >
          Logout
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          placeholder="Tên lớp (vd: Pair 1 - Buổi 1)"
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          style={{ padding: 8, marginRight: 10, width: 320 }}
        />
        <button onClick={createClass}>Tạo lớp</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Danh sách lớp</h3>

        {classes.length === 0 ? (
          <p>(Chưa có lớp nào)</p>
        ) : (
          classes.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #eee",
              }}
            >
              <div
                onClick={() => router.push(`/class/${c.id}`)}
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  textDecoration: "underline",
                  cursor: "pointer",
                  display: "inline-block",
                }}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/class/${c.id}`);
                }}
                title="Bấm để vào lớp"
              >
                {c.name}
              </div>

              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{c.id}</div>

              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>JOIN CODE: </span>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  {c.join_code ?? "—"}
                </span>

                <button
                  style={{ marginLeft: 10 }}
                  onClick={async () => {
                    if (!c.join_code) return;
                    await navigator.clipboard.writeText(c.join_code);
                    alert("Đã copy join code");
                  }}
                >
                  Copy
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => router.push(`/class/${c.id}`)}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  Vào lớp →
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
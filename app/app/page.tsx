"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import TutorDashboard from "@/app/components/TutorDashboard";
import StudentDashboard from "@/app/components/StudentDashboard";

type Role = "student" | "tutor" | null;

export default function AppPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error(error);
        setRole(null);
        setLoading(false);
        return;
      }

      const r = (profile?.role ?? null) as Role;
      setRole(r);
      setLoading(false);
    };

    loadUser();
  }, [router]);

  const fullBleedStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "var(--bg-main)",
    color: "var(--text-primary)",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  };

  if (loading) {
    return (
      <div
        style={{
          ...fullBleedStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!role) {
    return (
      <div
        style={{
          ...fullBleedStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          textAlign: "center",
        }}
      >
        Không tìm thấy role trong profiles.
        <br />
        (Check profiles.role = "student" hoặc "tutor")
      </div>
    );
  }

  // ✅ Full-bleed container: không bọc thêm UI, không thêm nút Logout ở đây nữa
  return (
    <div style={fullBleedStyle}>
      {role === "student" ? <StudentDashboard /> : null}
      {role === "tutor" ? <TutorDashboard /> : null}
    </div>
  );
}
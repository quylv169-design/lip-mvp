// app/page.tsx
"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  useEffect(() => {
    const run = async () => {
      // Nếu đã login -> vào dashboard
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace("/app");
        return;
      }

      // Chưa login -> về login
      window.location.replace("/login");
    };

    run();
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6f7fb",
        color: "#0f172a",
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        padding: 24,
      }}
    >
      Đang chuyển hướng…
    </div>
  );
}
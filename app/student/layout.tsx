// app/student/layout.tsx
import React from "react";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg-main)",
        color: "var(--text-primary)",
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elev)",
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Student</div>
      </div>

      {/* IMPORTANT: phải render children ở đây */}
      <div style={{ maxWidth: 1050, margin: "0 auto", padding: 16 }}>{children}</div>
    </div>
  );
}
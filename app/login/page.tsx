"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      if (!email || !password) {
        setMsg("Nhập email và mật khẩu.");
        return;
      }

      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMsg(error.message);
          return;
        }

        if (data.user) window.location.href = "/app";
        return;
      }

      // ✅ signup: luôn là học sinh
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      const user = data.user;
      if (!user) {
        setMsg("Đăng ký thành công. Hãy đăng nhập.");
        return;
      }

      // ✅ tạo profile role=student
      const { error: profileErr } = await supabase.from("profiles").insert({
        id: user.id,
        role: "student",
        full_name: fullName || null,
      });

      if (profileErr) {
        setMsg("Đăng ký OK nhưng tạo profile lỗi: " + profileErr.message);
        return;
      }

      setMsg("Đăng ký OK. Giờ bạn đăng nhập.");
      setMode("login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">
          {mode === "login" ? "Đăng nhập" : "Tạo tài khoản học sinh"}
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          LIP MVP • Buổi 1 (Present Simple)
        </p>

        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          {mode === "signup" ? (
            <div>
              <label className="text-sm font-medium">Tên hiển thị</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ví dụ: Bạn A"
              />
            </div>
          ) : null}

          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@lip.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Mật khẩu</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          {msg ? (
            <div className="rounded-lg bg-gray-50 border px-3 py-2 text-sm">
              {msg}
            </div>
          ) : null}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-black text-white py-2 font-medium disabled:opacity-60"
          >
            {loading
              ? "Đang xử lý..."
              : mode === "login"
              ? "Đăng nhập"
              : "Đăng ký học sinh"}
          </button>
        </form>

        <button
          className="mt-4 w-full text-sm text-gray-600 underline"
          onClick={() => {
            setMsg(null);
            setMode(mode === "login" ? "signup" : "login");
          }}
        >
          {mode === "login"
            ? "Chưa có tài khoản? Đăng ký học sinh"
            : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}
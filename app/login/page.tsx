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
        setMsg("Vui lòng nhập email và mật khẩu.");
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

      const { error: profileErr } = await supabase.from("profiles").insert({
        id: user.id,
        role: "student",
        full_name: fullName || null,
      });

      if (profileErr) {
        setMsg("Đăng ký OK nhưng tạo profile lỗi: " + profileErr.message);
        return;
      }

      setMsg("Đăng ký thành công. Giờ bạn đăng nhập nhé.");
      setMode("login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">

        {/* Logo / Brand */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">
            LIP
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            English Learning Platform
          </p>
        </div>

        <h2 className="text-xl font-semibold text-center mb-1">
          {mode === "login" ? "Đăng nhập" : "Tạo tài khoản học sinh"}
        </h2>

        <p className="text-center text-sm text-gray-500 mb-6">
          Buổi 1 • Present Simple
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === "signup" && (
            <div>
              <label className="text-sm font-medium text-gray-700">
                Tên hiển thị
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ví dụ: Bạn A"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@lip.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">
              Mật khẩu
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          {msg && (
            <div className="rounded-xl bg-gray-100 border border-gray-200 px-4 py-3 text-sm text-gray-700">
              {msg}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 transition text-white py-2.5 font-semibold disabled:opacity-60"
          >
            {loading
              ? "Đang xử lý..."
              : mode === "login"
              ? "Đăng nhập"
              : "Đăng ký học sinh"}
          </button>
        </form>

        <button
          className="mt-5 w-full text-sm text-indigo-600 hover:underline"
          onClick={() => {
            setMsg(null);
            setMode(mode === "login" ? "signup" : "login");
          }}
        >
          {mode === "login"
            ? "Chưa có tài khoản? Đăng ký ngay"
            : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}
// app/api/prelearning/attempts/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const { searchParams } = new URL(req.url);

    // Backward-compatible params
    const lessonId = (searchParams.get("lessonId") || "").trim();
    const studentId = (searchParams.get("studentId") || "").trim();

    // New optional params
    const classId = (searchParams.get("classId") || "").trim();
    const lessonIdsCsv = (searchParams.get("lessonIds") || "").trim(); // comma-separated
    const limitParam = (searchParams.get("limit") || "").trim();

    const limit = (() => {
      const n = Number(limitParam);
      if (!Number.isFinite(n) || n <= 0) return 50;
      return Math.min(300, Math.floor(n));
    })();

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const supabaseAuth = createClient(url, anonKey);
    const { data: userRes } = await supabaseAuth.auth.getUser(token);
    const user = userRes?.user;
    if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    if (!studentId) return NextResponse.json({ error: "Missing studentId" }, { status: 400 });

    // MVP: student chỉ xem của chính mình
    if (user.id !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseAdmin = createClient(url, serviceKey);

    // Build lessonIds filter (optional)
    const lessonIds = lessonIdsCsv
      ? lessonIdsCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // ✅ Query the REAL columns (new schema)
    let q = supabaseAdmin
      .from("prelearning_attempts")
      .select(
        [
          "id",
          "lesson_id",
          "class_id",
          "student_id",
          "seed",
          "created_at",
          "total_score",
          "notebook_content_score",
          "notebook_presentation_score",
          "quiz_score",
          "questions_score",
          "pre_quiz_total",
          "pre_quiz_correct",
          "notebook_image_urls",
          "ai_feedback",
          "quiz_payload",
          "quiz_answers",
          "questions",
        ].join(",")
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (classId) q = q.eq("class_id", classId);
    if (lessonId) q = q.eq("lesson_id", lessonId);
    if (!lessonId && lessonIds.length > 0) q = q.in("lesson_id", lessonIds);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: "Query failed", detail: error.message }, { status: 500 });
    }

    // ✅ Sign notebook images (bucket: "prelearning-notebooks")
    const out: any[] = [];
    for (const row of (data ?? []) as any[]) {
      // Guard type để tránh TS: "Spread types may only be created from object types"
      const base: Record<string, any> =
        row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, any>) : {};

      const paths: string[] = Array.isArray(base.notebook_image_urls) ? base.notebook_image_urls : [];
      const signedUrls: string[] = [];

      for (const p of paths) {
        const path = String(p || "").trim();
        if (!path) continue;

        const { data: signed, error: sErr } = await supabaseAdmin.storage
          .from("prelearning-notebooks")
          .createSignedUrl(path, 60 * 30); // 30 minutes

        if (!sErr && signed?.signedUrl) signedUrls.push(signed.signedUrl);
      }

      out.push({
        ...base,
        // Giữ nguyên dữ liệu gốc để debug
        notebook_image_paths: paths,
        // Trả thêm signed urls để FE render được
        notebook_images: signedUrls,
      });
    }

    return NextResponse.json({ attempts: out }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: "Internal error", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get("lessonId") || "";
    const studentId = searchParams.get("studentId") || "";

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const supabaseAuth = createClient(url, anonKey);
    const { data: userRes } = await supabaseAuth.auth.getUser(token);
    const user = userRes?.user;
    if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    // MVP: student chỉ xem của chính mình
    if (user.id !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseAdmin = createClient(url, serviceKey);

    const q = supabaseAdmin
      .from("prelearning_attempts")
      .select("id, lesson_id, class_id, student_id, prelearning_score_10, notebook_image_paths, ai_feedback, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (lessonId) q.eq("lesson_id", lessonId);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: "Query failed", detail: error.message }, { status: 500 });
    }

    // ✅ sign notebook images
    const out = [];
    for (const row of data ?? []) {
      const paths: string[] = Array.isArray((row as any).notebook_image_paths) ? (row as any).notebook_image_paths : [];
      const signedUrls: string[] = [];

      for (const p of paths) {
        if (!p) continue;
        const { data: signed, error: sErr } = await supabaseAdmin.storage
          .from("prelearning-notebooks")
          .createSignedUrl(p, 60 * 30); // 30 minutes

        if (!sErr && signed?.signedUrl) signedUrls.push(signed.signedUrl);
      }

      out.push({
        ...row,
        notebook_images: signedUrls,
      });
    }

    return NextResponse.json({ attempts: out }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: "Internal error", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
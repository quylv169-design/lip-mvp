import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function num(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // ✅ Verify user by Bearer token (client must send it)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization token" },
        { status: 401 }
      );
    }

    const supabaseAuth = createClient(url, anonKey);
    const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const authedUserId = userRes.user.id;

    // ✅ Basic validation
    const lesson_id = String(body.lesson_id ?? "");
    const class_id = String(body.class_id ?? "");
    const student_id = String(body.student_id ?? "");
    const seed = String(body.seed ?? "");

    if (!lesson_id || !class_id || !student_id) {
      return NextResponse.json(
        { error: "Missing lesson_id/class_id/student_id" },
        { status: 400 }
      );
    }

    // ✅ Student can only save their own attempt (MVP)
    if (authedUserId !== student_id) {
      return NextResponse.json(
        { error: "Forbidden (not your student_id)" },
        { status: 403 }
      );
    }

    const notebook_content_score = num(body.notebook_content_score);
    const notebook_presentation_score = num(body.notebook_presentation_score);
    const quiz_score = num(body.quiz_score);
    const questions_score = num(body.questions_score);

    // ✅ total_score (numeric) is the real column
    const totalScore =
      notebook_content_score +
      notebook_presentation_score +
      quiz_score +
      questions_score;

    // ✅ DB column is notebook_image_urls (text[])
    // Backward-compatible: accept either notebook_image_urls or notebook_image_paths from client
    const notebook_image_urls: string[] = Array.isArray(body.notebook_image_urls)
      ? body.notebook_image_urls.map((x: any) => String(x)).filter(Boolean)
      : Array.isArray(body.notebook_image_paths)
        ? body.notebook_image_paths.map((x: any) => String(x)).filter(Boolean)
        : [];

    const notebook_image_hashes: string[] = Array.isArray(body.notebook_image_hashes)
      ? body.notebook_image_hashes.map((x: any) => String(x)).filter(Boolean)
      : [];

    // ✅ Column names in DB:
    // pre_quiz_total (int4), pre_quiz_correct (int4)
    const pre_quiz_total = num(body.pre_quiz_total);
    const pre_quiz_correct = num(
      body.pre_quiz_correct ?? body.pre_quiz_score // backward compatible
    );

    // ✅ quiz_payload (jsonb)
    // accept either quiz_payload or quiz from client
    const quiz_payload = body.quiz_payload ?? body.quiz ?? null;

    const quiz_answers: number[] = Array.isArray(body.quiz_answers)
      ? body.quiz_answers.map((x: any) => num(x))
      : [];

    const questions: string[] = Array.isArray(body.questions)
      ? body.questions.map((x: any) => String(x)).filter(Boolean)
      : [];

    const ai_feedback = body.ai_feedback ?? {};

    const supabaseAdmin = createClient(url, serviceKey);

    // ✅ Insert a NEW attempt every time (no upsert)
    const { data, error } = await supabaseAdmin
      .from("prelearning_attempts")
      .insert({
        lesson_id,
        class_id,
        student_id,
        seed: seed || null,

        notebook_image_urls,
        notebook_image_hashes,

        notebook_content_score,
        notebook_presentation_score,
        quiz_score,
        questions_score,

        // ✅ corrected column name:
        total_score: totalScore,

        // ✅ corrected column name:
        pre_quiz_total,
        pre_quiz_correct,

        // ✅ corrected column name:
        quiz_payload,

        quiz_answers,
        questions,

        ai_feedback,
      })
      .select("id, total_score, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "DB insert failed", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      totalScore: data?.total_score ?? totalScore,
      attemptId: data?.id,
      createdAt: data?.created_at,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal server error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
// app/api/lesson-slide-signed-url/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function makeSupabaseClientWithJwt(jwt: string) {
  // Use SERVICE ROLE if available (recommended) so Storage policy doesn't block server-side signed URL.
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const key = service || anon;
  if (!key) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lessonId = url.searchParams.get("lessonId");

    if (!lessonId) {
      return NextResponse.json({ error: "lessonId is required" }, { status: 400 });
    }

    // Verify Supabase user from Authorization: Bearer <access_token>
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) {
      return NextResponse.json({ error: "Missing Authorization bearer token" }, { status: 401 });
    }

    const supabase = makeSupabaseClientWithJwt(jwt);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = userRes.user.id;

    // Load profile role
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    // Load lesson (need class_id + slide_path)
    const { data: lesson, error: lessonErr } = await supabase
      .from("lessons")
      .select("id, class_id, slide_path, slide_updated_at")
      .eq("id", lessonId)
      .single();

    if (lessonErr || !lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    if (!lesson.slide_path) {
      return NextResponse.json({ error: "This lesson has no slide yet" }, { status: 404 });
    }

    const role = String((profile as any).role || "");

    // Authorization:
    // - admin: always ok
    // - tutor: must own class
    // - student: must be class member
    let allowed = false;

    if (role === "admin") {
      allowed = true;
    } else {
      const { data: klass, error: classErr } = await supabase
        .from("classes")
        .select("id, tutor_id")
        .eq("id", lesson.class_id)
        .single();

      if (classErr || !klass) {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }

      if (role === "tutor" && klass.tutor_id === userId) {
        allowed = true;
      }

      if (role === "student") {
        const { data: member, error: memberErr } = await supabase
          .from("class_members")
          .select("class_id")
          .eq("class_id", lesson.class_id)
          .eq("student_id", userId)
          .maybeSingle();

        if (!memberErr && member) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    // Signed URL: 30 minutes
    const expiresIn = 60 * 30;

    const { data: signed, error: signedErr } = await supabase.storage
      .from("slides")
      .createSignedUrl(lesson.slide_path, expiresIn);

    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signedErr?.message || "Failed to create signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: signed.signedUrl,
      expiresIn,
      slidePath: lesson.slide_path,
      slideUpdatedAt: lesson.slide_updated_at ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
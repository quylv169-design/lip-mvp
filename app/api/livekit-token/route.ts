// app/api/livekit-token/route.ts
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

type Body = {
  classId: string;
};

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const { classId } = (await req.json()) as Body;
    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    // 1) Verify Supabase user from Authorization: Bearer <access_token>
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) {
      return NextResponse.json({ error: "Missing Authorization bearer token" }, { status: 401 });
    }

    const supabase = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
      }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = userRes.user.id;

    // 2) Load profile role + full_name
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    // 3) Load class + check membership
    const { data: klass, error: classErr } = await supabase
      .from("classes")
      .select("id, tutor_id")
      .eq("id", classId)
      .single();

    if (classErr || !klass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const isTutor = klass.tutor_id === userId; // ✅ SOURCE OF TRUTH
    const isAdmin = String((profile as any).role || "") === "admin";

    let allowed = false;

    // Admin always allowed (optional but sane)
    if (isAdmin) allowed = true;

    // Tutor allowed if owns this class (SOURCE OF TRUTH)
    if (!allowed && isTutor) allowed = true;

    // Student allowed if exists in class_members
    if (!allowed) {
      const { data: member, error: memberErr } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("class_id", classId)
        .eq("student_id", userId)
        .maybeSingle();

      if (!memberErr && member) allowed = true;
    }

    if (!allowed) {
      return NextResponse.json({ error: "Not allowed in this class" }, { status: 403 });
    }

    // 4) Create LiveKit token
    const roomName = `class_${classId}`;

    const fullName =
      typeof (profile as any).full_name === "string" && (profile as any).full_name.trim()
        ? (profile as any).full_name.trim()
        : userId;

    // ✅ role written into metadata is now stable:
    // - tutor is based on classes.tutor_id (NOT profiles.role)
    // - admin stays admin
    // - otherwise student
    const stableRole: "admin" | "tutor" | "student" = isAdmin ? "admin" : isTutor ? "tutor" : "student";

    const at = new AccessToken(getEnv("LIVEKIT_API_KEY"), getEnv("LIVEKIT_API_SECRET"), {
      identity: userId,
      name: fullName,
      metadata: JSON.stringify({
        role: stableRole,
        full_name: fullName,
        // helpful debug fields
        tutor_id: klass.tutor_id,
        class_id: classId,
      }),
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      roomName,
      identity: userId,
      tutorId: klass.tutor_id,
      isTutor, // ✅ client can trust this
      role: stableRole,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
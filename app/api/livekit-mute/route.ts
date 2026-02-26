// app/api/livekit-mute/route.ts
import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

type Body = {
  classId: string;
  studentId: string; // identity of student (Supabase user id)
};

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function livekitHostFromPublicUrl(url: string) {
  // RoomServiceClient expects http(s) host, not ws(s)
  if (url.startsWith("wss://")) return "https://" + url.slice("wss://".length);
  if (url.startsWith("ws://")) return "http://" + url.slice("ws://".length);
  return url;
}

export async function POST(req: Request) {
  try {
    const { classId, studentId } = (await req.json()) as Body;
    if (!classId || !studentId) {
      return NextResponse.json({ error: "classId and studentId are required" }, { status: 400 });
    }

    // Verify Supabase user from Authorization: Bearer <access_token>
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

    // Load profile role
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    // Load class + ownership check (ONLY tutor owner can mute)
    const { data: klass, error: classErr } = await supabase
      .from("classes")
      .select("id, tutor_id")
      .eq("id", classId)
      .single();

    if (classErr || !klass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const isOwnerTutor = profile.role === "tutor" && klass.tutor_id === userId;
    if (!isOwnerTutor) {
      return NextResponse.json({ error: "Only class tutor can mute students" }, { status: 403 });
    }

    // Ensure target is actually a member (optional safety)
    const { data: member, error: memberErr } = await supabase
      .from("class_members")
      .select("class_id")
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json({ error: "Target student is not in this class" }, { status: 403 });
    }

    // LiveKit: find student's published audio tracks and mute them
    const roomName = `class_${classId}`;

    const publicUrl = getEnv("NEXT_PUBLIC_LIVEKIT_URL");
    const host = livekitHostFromPublicUrl(publicUrl);

    const roomService = new RoomServiceClient(
      host,
      getEnv("LIVEKIT_API_KEY"),
      getEnv("LIVEKIT_API_SECRET")
    );

    const participants = await roomService.listParticipants(roomName);
    const target = participants.find((p) => p.identity === studentId);

    if (!target) {
      return NextResponse.json({ error: "Student is not connected to the room" }, { status: 404 });
    }

    const audioTracks = (target.tracks || []).filter((t) => {
      // LiveKit returns TrackInfo with .type and sometimes .source
      const type = (t as any).type; // "AUDIO" | "VIDEO" (enum/string depending on sdk)
      const source = (t as any).source; // "MICROPHONE" etc (may be number enum)
      const isAudioType =
        type === "AUDIO" || type === 0 /* TrackType.AUDIO */ || String(type).toLowerCase() === "audio";
      const isMicSource =
        source === "MICROPHONE" ||
        String(source).toLowerCase() === "microphone" ||
        source === 2 /* TrackSource.MICROPHONE in some builds */;

      // safest: audio type is enough to mute mic tracks
      return isAudioType || isMicSource;
    });

    if (audioTracks.length === 0) {
      return NextResponse.json({ ok: true, muted: 0, note: "No audio track to mute" });
    }

    let mutedCount = 0;
    for (const t of audioTracks) {
      if (!t.sid) continue;
      await roomService.mutePublishedTrack(roomName, studentId, t.sid, true);
      mutedCount += 1;
    }

    return NextResponse.json({ ok: true, muted: mutedCount });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
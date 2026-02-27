// app/class/[id]/ClassroomClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";

import {
  Track,
  Room,
  RoomEvent,
  Participant,
  LocalParticipant,
  TrackPublication,
} from "livekit-client";

type Props = { classId: string };

type TokenInfo = {
  roomName: string;
  token: string;
  tutorId?: string;
  identity?: string;
};

type ChatMsg = {
  id: string;
  ts: number;
  from: string;
  text: string;
};

type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  order_index: number;
  slide_path: string | null;
};

const RIGHT_COL_W = 360;

const UI_FONT =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

function labelOf(p: Participant) {
  // IMPORTANT: full name comes from token "name"
  return (p.name && p.name.trim()) || p.identity || "user";
}

function safeParseRole(p: Participant): string | null {
  try {
    const raw = (p as any)?.metadata;
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return typeof obj?.role === "string" ? obj.role : null;
  } catch {
    return null;
  }
}

function isTutorByRole(p: Participant) {
  const r = safeParseRole(p);
  return r === "tutor";
}

/**
 * LiveKit remoteParticipants is a Map that may mutate in-place.
 * useMemo deps won't update => empty slots bug.
 * So we subscribe to participant events to force rerender.
 */
function useAllParticipants(room: Room | undefined) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!room) return;

    const bump = () => force((x) => x + 1);

    room.on(RoomEvent.ParticipantConnected, bump);
    room.on(RoomEvent.ParticipantDisconnected, bump);
    room.on(RoomEvent.ConnectionStateChanged, bump);
    room.on(RoomEvent.TrackPublished, bump);
    room.on(RoomEvent.TrackUnpublished, bump);
    room.on(RoomEvent.TrackSubscribed, bump);
    room.on(RoomEvent.TrackUnsubscribed, bump);
    room.on(RoomEvent.ParticipantMetadataChanged, bump);
    room.on(RoomEvent.ParticipantNameChanged, bump);

    // local track changes
    room.on(RoomEvent.LocalTrackPublished, bump);
    room.on(RoomEvent.LocalTrackUnpublished, bump);
    room.on(RoomEvent.TrackMuted, bump);
    room.on(RoomEvent.TrackUnmuted, bump);

    return () => {
      room.off(RoomEvent.ParticipantConnected, bump);
      room.off(RoomEvent.ParticipantDisconnected, bump);
      room.off(RoomEvent.ConnectionStateChanged, bump);
      room.off(RoomEvent.TrackPublished, bump);
      room.off(RoomEvent.TrackUnpublished, bump);
      room.off(RoomEvent.TrackSubscribed, bump);
      room.off(RoomEvent.TrackUnsubscribed, bump);
      room.off(RoomEvent.ParticipantMetadataChanged, bump);
      room.off(RoomEvent.ParticipantNameChanged, bump);

      room.off(RoomEvent.LocalTrackPublished, bump);
      room.off(RoomEvent.LocalTrackUnpublished, bump);
      room.off(RoomEvent.TrackMuted, bump);
      room.off(RoomEvent.TrackUnmuted, bump);
    };
  }, [room]);

  return useMemo(() => {
    if (!room) return [];
    return [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
  }, [room, room?.localParticipant, room?.remoteParticipants.size]);
}

function getEnabledState(p: LocalParticipant, source: Track.Source) {
  const pub = p.getTrackPublication(source);
  if (!pub) return false;

  // Publication exists but could be muted
  const muted = (pub as any).isMuted === true;
  return !muted;
}

function useLocalMediaState(room: Room | undefined) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!room) return;

    const bump = () => force((x) => x + 1);

    room.on(RoomEvent.LocalTrackPublished, bump);
    room.on(RoomEvent.LocalTrackUnpublished, bump);
    room.on(RoomEvent.TrackMuted, bump);
    room.on(RoomEvent.TrackUnmuted, bump);
    room.on(RoomEvent.ConnectionStateChanged, bump);

    return () => {
      room.off(RoomEvent.LocalTrackPublished, bump);
      room.off(RoomEvent.LocalTrackUnpublished, bump);
      room.off(RoomEvent.TrackMuted, bump);
      room.off(RoomEvent.TrackUnmuted, bump);
      room.off(RoomEvent.ConnectionStateChanged, bump);
    };
  }, [room]);

  const lp = room?.localParticipant;
  const camOn = lp ? getEnabledState(lp, Track.Source.Camera) : false;
  const micOn = lp ? getEnabledState(lp, Track.Source.Microphone) : false;

  return { camOn, micOn };
}

/**
 * Camera tile using LiveKit track publication object.
 * This is more stable for LocalParticipant (student seeing own camera).
 */
function CameraTileByPub({
  participant,
  publication,
}: {
  participant: Participant;
  publication?: TrackPublication;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camTrack = publication?.videoTrack;
  const hasCam = !!camTrack;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!camTrack) return;
    camTrack.attach(el);

    return () => {
      camTrack.detach(el);
    };
  }, [camTrack]);

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant instanceof LocalParticipant}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: hasCam ? "block" : "none",
        }}
      />

      {!hasCam && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.7)",
            fontSize: 13,
            background:
              "radial-gradient(70% 70% at 50% 50%, rgba(255,255,255,0.08), rgba(0,0,0,0.25))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.9 }}>
            <span style={{ fontSize: 18 }}>📷</span>
            <span style={{ fontWeight: 700 }}>Camera off</span>
          </div>

          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, transparent 49%, rgba(255,255,255,0.12) 50%, transparent 51%)",
              opacity: 0.6,
              pointerEvents: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Overlay (name + role) reused */
function TileFooter({ participant }: { participant: Participant }) {
  const name = labelOf(participant);
  const role = isTutorByRole(participant) ? "Tutor" : "Student";

  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        bottom: 10,
        right: 10,
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        alignItems: "center",
        padding: "6px 8px",
        borderRadius: 12,
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontSize: 12,
      }}
    >
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
      <div
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: isTutorByRole(participant)
            ? "rgba(120,170,255,0.12)"
            : "rgba(255,255,255,0.06)",
          opacity: 0.95,
          flex: "none",
        }}
      >
        {role}
      </div>
    </div>
  );
}

/** Button to leave class: disconnect room then go back */
function LeaveButton({ to = "/app" }: { to?: string }) {
  const router = useRouter();
  const room = useRoomContext();

  return (
    <button
      onClick={() => {
        try {
          room?.disconnect();
        } catch {}
        router.push(to);
      }}
      style={{
        fontFamily: UI_FONT,
        height: 34,
        padding: "0 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        color: "white",
        fontWeight: 800,
        cursor: "pointer",
      }}
      title="Rời lớp và quay về dashboard"
    >
      ← Back
    </button>
  );
}

/** Best-effort disconnect on refresh/close */
function AutoDisconnectOnUnload() {
  const room = useRoomContext();

  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        room?.disconnect();
      } catch {}
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [room]);

  return null;
}

/**
 * Local controls:
 * - ALL users: Mic + Cam toggle
 * (NO screenshare anymore)
 */
function LocalControls() {
  const room = useRoomContext();
  const local = room?.localParticipant;

  const { camOn, micOn } = useLocalMediaState(room);
  const [busy, setBusy] = useState<null | "cam" | "mic">(null);

  const btnBase: React.CSSProperties = {
    fontFamily: UI_FONT,
    height: 34,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    userSelect: "none",
  };

  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: on ? "rgba(120,170,255,0.18)" : "rgba(255,255,255,0.06)",
    opacity: 0.95,
  });

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button
        disabled={!local || busy !== null}
        onClick={async () => {
          if (!local) return;
          setBusy("cam");
          try {
            await local.setCameraEnabled(!camOn);
          } finally {
            setBusy(null);
          }
        }}
        style={{
          ...btnBase,
          opacity: !local || busy !== null ? 0.55 : 1,
        }}
        title="Bật/Tắt camera của bạn"
      >
        📷 <span>Cam</span> <span style={pill(camOn)}>{camOn ? "On" : "Off"}</span>
      </button>

      <button
        disabled={!local || busy !== null}
        onClick={async () => {
          if (!local) return;
          setBusy("mic");
          try {
            await local.setMicrophoneEnabled(!micOn);
          } finally {
            setBusy(null);
          }
        }}
        style={{
          ...btnBase,
          opacity: !local || busy !== null ? 0.55 : 1,
        }}
        title="Bật/Tắt micro của bạn"
      >
        🎙️ <span>Mic</span> <span style={pill(micOn)}>{micOn ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

type SlideStateMsg = {
  type: "slide_state";
  lessonId: string;
  page: number;
  ts: number;
};

/** Center board: Slide presenter (Tutor controls, students follow) */
function Board({ classId }: { classId: string }) {
  const room = useRoomContext();
  const local = room?.localParticipant;
  const meIsTutor = !!local && isTutorByRole(local);

  const btnBase: React.CSSProperties = {
    fontFamily: UI_FONT,
    height: 34,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    userSelect: "none",
  };

  // Lessons list (so tutor can pick correct lesson / slide)
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [lessonLoading, setLessonLoading] = useState(false);

  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [slideUrl, setSlideUrl] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [presenting, setPresenting] = useState(false);

  // Keep last received state for students (or even tutor who joins later)
  const [followLessonId, setFollowLessonId] = useState<string>("");
  const [followPage, setFollowPage] = useState<number>(1);

  const effectiveLessonId = meIsTutor ? selectedLessonId : followLessonId;
  const effectivePage = meIsTutor ? page : followPage;

  const effectiveSlideSrc = useMemo(() => {
    if (!slideUrl) return "";
    // PDF page hint: many built-in PDF viewers respect #page
    const hash = `#page=${Math.max(1, effectivePage)}`;
    return slideUrl.includes("#") ? slideUrl : `${slideUrl}${hash}`;
  }, [slideUrl, effectivePage]);

  async function fetchLessonsOnce() {
    if (!classId) return;
    setLessonLoading(true);
    try {
      const { data, error } = await supabase
        .from("lessons")
        .select("id,class_id,title,order_index,slide_path")
        .eq("class_id", classId)
        .order("order_index", { ascending: true });

      if (error) {
        console.error("[Board] fetch lessons error:", error);
        setLessons([]);
        return;
      }
      setLessons((data as LessonRow[]) || []);

      // auto pick first lesson if empty
      if (!selectedLessonId && data && data.length > 0) {
        setSelectedLessonId((data[0] as any).id);
      }
    } finally {
      setLessonLoading(false);
    }
  }

  async function fetchSignedUrl(lessonId: string) {
    if (!lessonId) return "";

    // ✅ IMPORTANT: use Bearer token like /api/livekit-token
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;

    if (!accessToken) {
      console.error("[Board] Missing access_token. User not logged in?");
      return "";
    }

    try {
      const res = await fetch(
        `/api/lesson-slide-signed-url?lessonId=${encodeURIComponent(lessonId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const json = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        console.error(
          "[Board] lesson-slide-signed-url failed:",
          res.status,
          json?.error || json
        );
        return "";
      }

      const url = String(json?.signedUrl || "");
      if (!url) {
        console.error("[Board] signedUrl is empty. Response:", json);
      }
      return url;
    } catch (e) {
      console.error("[Board] fetchSignedUrl exception:", e);
      return "";
    }
  }

  // Load lessons list
  useEffect(() => {
    fetchLessonsOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // LiveKit data channel: receive slide_state
  useEffect(() => {
    if (!room) return;

    const onData = (payload: Uint8Array) => {
      try {
        const decoded = new TextDecoder().decode(payload);
        const obj = JSON.parse(decoded) as any;

        if (obj?.type !== "slide_state") return;

        const msg = obj as SlideStateMsg;
        if (!msg.lessonId || typeof msg.page !== "number") return;

        // Students follow; tutor can ignore incoming
        if (meIsTutor) return;

        setFollowLessonId(msg.lessonId);
        setFollowPage(Math.max(1, msg.page));
      } catch {
        // ignore
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, meIsTutor]);

  // When effective lesson changes (tutor selected OR student follows), fetch signed URL on this client
  useEffect(() => {
    if (!effectiveLessonId) {
      setSlideUrl("");
      return;
    }

    (async () => {
      const url = await fetchSignedUrl(effectiveLessonId);
      setSlideUrl(url);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLessonId]);

  // Tutor: broadcast current state (lessonId + page) so all students sync
  const broadcastState = async (nextLessonId: string, nextPage: number) => {
    if (!room) return;
    const payload: SlideStateMsg = {
      type: "slide_state",
      lessonId: nextLessonId,
      page: Math.max(1, nextPage),
      ts: Date.now(),
    };
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      room.localParticipant.publishData(bytes, { reliable: true });
    } catch (e) {
      console.error(e);
    }
  };

  // Tutor: start presenting -> push state so students instantly sync (they will fetch signedUrl themselves)
  const startPresenting = async () => {
    if (!meIsTutor) return;
    const lessonId = selectedLessonId;
    if (!lessonId) return;

    setPresenting(true);
    const safePage = Math.max(1, page);
    setPage(safePage);
    await broadcastState(lessonId, safePage);
  };

  const stopPresenting = async () => {
    // MVP: keep last state; stopping just disables tutor controls
    setPresenting(false);
  };

  // Tutor: when changing lesson/page while presenting, broadcast
  useEffect(() => {
    if (!meIsTutor) return;
    if (!presenting) return;
    if (!selectedLessonId) return;
    broadcastState(selectedLessonId, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meIsTutor, presenting, selectedLessonId, page]);

  const canControl = meIsTutor;

  const lessonTitle = useMemo(() => {
    const id = effectiveLessonId;
    if (!id) return "";
    const found = lessons.find((l) => l.id === id);
    return found ? found.title : "";
  }, [effectiveLessonId, lessons]);

  const hasSlide = !!slideUrl;

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 14, opacity: 0.9 }}>Board</div>
          <LeaveButton to="/app" />
          <LocalControls />

          {/* Slide controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Slide</div>

            <select
              disabled={!canControl || lessonLoading}
              value={selectedLessonId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedLessonId(v);
                setPage(1);
              }}
              style={{
                fontFamily: UI_FONT,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.35)",
                color: "white",
                padding: "0 10px",
                outline: "none",
                opacity: !canControl ? 0.55 : 1,
              }}
              title={canControl ? "Chọn lesson để trình chiếu" : "Chỉ tutor mới được chọn lesson"}
            >
              {lessons.length === 0 ? (
                <option value="">
                  {lessonLoading ? "Loading lessons..." : "No lessons"}
                </option>
              ) : (
                lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.order_index}. {l.title}
                    {l.slide_path ? "" : " (no slide)"}
                  </option>
                ))
              )}
            </select>

            {meIsTutor ? (
              presenting ? (
                <button onClick={stopPresenting} style={btnBase} title="Tắt chế độ trình chiếu (MVP)">
                  ⏸️ Presenting
                </button>
              ) : (
                <button
                  onClick={startPresenting}
                  disabled={!selectedLessonId}
                  style={{ ...btnBase, opacity: !selectedLessonId ? 0.55 : 1 }}
                  title="Bắt đầu trình chiếu slide cho cả lớp"
                >
                  ▶️ Present
                </button>
              )
            ) : (
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  padding: "0 8px",
                  height: 34,
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                }}
                title="Bạn đang xem slide theo tutor"
              >
                Following tutor
              </div>
            )}

            <button
              disabled={!hasSlide}
              onClick={() => {
                if (!hasSlide) return;
                const url = slideUrl.includes("#")
                  ? slideUrl
                  : `${slideUrl}#page=${Math.max(1, effectivePage)}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              style={{ ...btnBase, opacity: !hasSlide ? 0.55 : 1 }}
              title="Mở slide ở tab mới (fullscreen chắc ăn)"
            >
              ↗ Open
            </button>

            <button
              disabled={!hasSlide || !canControl}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ ...btnBase, opacity: !hasSlide || !canControl ? 0.55 : 1 }}
              title={canControl ? "Trang trước" : "Chỉ tutor điều khiển trang"}
            >
              ◀ Prev
            </button>

            <div
              style={{
                height: 34,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 12,
                opacity: 0.9,
              }}
              title="Trang đang trình chiếu"
            >
              Page
              <input
                value={String(effectivePage)}
                disabled={!hasSlide || !canControl}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = Math.max(1, parseInt(raw || "1", 10) || 1);
                  setPage(n);
                }}
                style={{
                  fontFamily: UI_FONT,
                  width: 54,
                  height: 26,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.35)",
                  color: "white",
                  padding: "0 8px",
                  outline: "none",
                  opacity: !hasSlide || !canControl ? 0.55 : 1,
                }}
              />
              {lessonTitle ? (
                <span
                  style={{
                    opacity: 0.7,
                    whiteSpace: "nowrap",
                    maxWidth: 260,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  • {lessonTitle}
                </span>
              ) : null}
            </div>

            <button
              disabled={!hasSlide || !canControl}
              onClick={() => setPage((p) => Math.max(1, p + 1))}
              style={{ ...btnBase, opacity: !hasSlide || !canControl ? 0.55 : 1 }}
              title={canControl ? "Trang tiếp" : "Chỉ tutor điều khiển trang"}
            >
              Next ▶
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.65 }}>
          Room: <span style={{ opacity: 0.9 }}>{room.name}</span>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
          position: "relative",
        }}
      >
        {hasSlide ? (
          <iframe
            key={`${effectiveLessonId}-${slideUrl}`} // reload when lesson changes
            src={effectiveSlideSrc}
            title="Slide"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "black",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              padding: 24,
              textAlign: "center",
              color: "rgba(255,255,255,0.75)",
            }}
          >
            <div style={{ maxWidth: 560 }}>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Chưa có slide</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.9 }}>
                {meIsTutor ? (
                  <>
                    Chọn <b>Lesson</b> có slide, rồi bấm <b>Present</b> để trình chiếu.
                    <br />
                    (Nếu lesson chưa có slide, hãy upload trong <b>/admin</b> trước.)
                  </>
                ) : (
                  <>
                    Chờ tutor bấm <b>Present</b> để bạn xem slide.
                    <br />
                    Nếu vẫn không thấy, có thể lesson chưa được upload slide.
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function useSimpleChat(room: Room | undefined) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!room) return;

    const onData = (payload: Uint8Array, participant?: Participant) => {
      try {
        const decoded = new TextDecoder().decode(payload);
        const obj = JSON.parse(decoded) as any;

        // Ignore slide state messages here (they are handled in Board)
        if (obj?.type === "slide_state") return;

        const msg = obj as { t: string; ts: number };
        if (typeof msg?.t !== "string") return;

        setMessages((prev) => [
          ...prev,
          {
            id: `${msg.ts}-${participant?.identity ?? "unknown"}-${Math.random().toString(16).slice(2)}`,
            ts: msg.ts,
            from: participant ? labelOf(participant) : "system",
            text: msg.t,
          },
        ]);
      } catch {
        // ignore
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  const send = async () => {
    if (!room) return;
    const t = text.trim();
    if (!t) return;

    const payload = new TextEncoder().encode(JSON.stringify({ t, ts: Date.now() }));
    room.localParticipant.publishData(payload, { reliable: true });

    setMessages((prev) => [...prev, { id: `${Date.now()}-me`, ts: Date.now(), from: "Me", text: t }]);
    setText("");
  };

  return { messages, text, setText, send };
}

function RightColumn() {
  const room = useRoomContext();
  const { messages, text, setText, send } = useSimpleChat(room);

  // Stable camera publications (includes local + remote)
  const camTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], {
    onlySubscribed: false,
  });

  const all = useAllParticipants(room);

  const top3 = useMemo(() => {
    const sorted = [...all].sort((a, b) => {
      const aIsTutor = isTutorByRole(a);
      const bIsTutor = isTutorByRole(b);
      if (aIsTutor === bIsTutor) return 0;
      return aIsTutor ? -1 : 1;
    });
    return sorted.slice(0, 3);
  }, [all]);

  const tiles: Array<Participant | null> = [...top3];
  while (tiles.length < 3) tiles.push(null);

  const pubByIdentity = useMemo(() => {
    const m = new Map<string, TrackPublication>();
    for (const t of camTracks) {
      const p = t.participant;
      const pub = t.publication as TrackPublication;
      if (p?.identity) m.set(p.identity, pub);
    }
    return m;
  }, [camTracks]);

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 12,
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <div>
        <div style={{ fontWeight: 800, fontSize: 14, opacity: 0.9, marginBottom: 10 }}>People</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {tiles.map((p, idx) =>
            p ? (
              <div key={p.identity} style={{ height: 110, position: "relative" }}>
                <CameraTileByPub participant={p} publication={pubByIdentity.get(p.identity)} />
                <TileFooter participant={p} />
              </div>
            ) : (
              <div
                key={`empty-${idx}`}
                style={{
                  height: 110,
                  borderRadius: 14,
                  border: "1px dashed rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.02)",
                  display: "grid",
                  placeItems: "center",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 13,
                }}
              >
                Empty slot
              </div>
            )
          )}
        </div>
      </div>

      <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ fontWeight: 800, fontSize: 14, opacity: 0.9, marginBottom: 10 }}>Messages</div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.02)",
            padding: 10,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>No messages yet.</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>{m.from}</div>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{m.text}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Type a message..."
          style={{
            fontFamily: UI_FONT,
            flex: 1,
            height: 42,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.35)",
            color: "white",
            padding: "0 12px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={send}
          style={{
            fontFamily: UI_FONT,
            height: 42,
            padding: "0 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.08)",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
            boxSizing: "border-box",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MinimalClassroomUI({ classId }: { classId: string }) {
  return (
    <div
      style={{
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        background: "#070707",
        color: "white",
        fontFamily: UI_FONT,
        display: "grid",
        gridTemplateColumns: `1fr ${RIGHT_COL_W}px`,
        minHeight: 0,
      }}
    >
      <div style={{ padding: 12, minWidth: 0, minHeight: 0 }}>
        <Board classId={classId} />
      </div>

      <div
        style={{
          borderLeft: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.02)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <RightColumn />
      </div>
    </div>
  );
}

export default function ClassroomClient({ classId }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [info, setInfo] = useState<TokenInfo | null>(null);

  // IMPORTANT: all hooks must be BEFORE any return (avoid hook-order bug)
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const { data: auth } = await supabase.auth.getSession();
      const accessToken = auth.session?.access_token;
      if (!accessToken) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/livekit-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ classId }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErr(json?.error || "Failed to get token");
        setLoading(false);
        return;
      }

      setInfo({
        roomName: json.roomName,
        token: json.token,
        tutorId: json.tutorId,
        identity: json.identity,
      });
      setLoading(false);
    })();
  }, [classId, router]);

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (loading) return <div style={{ padding: 40 }}>Loading classroom…</div>;
  if (err) return <div style={{ padding: 40 }}>Error: {err}</div>;

  if (!serverUrl) {
    return (
      <div style={{ padding: 40 }}>
        Error: Missing <code>NEXT_PUBLIC_LIVEKIT_URL</code> in <code>.env.local</code>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={info!.token}
      serverUrl={serverUrl}
      connect={true}
      video={true}
      audio={true}
      style={{ height: "100dvh", width: "100vw" }}
    >
      <RoomAudioRenderer />
      <AutoDisconnectOnUnload />
      <MinimalClassroomUI classId={classId} />
    </LiveKitRoom>
  );
}
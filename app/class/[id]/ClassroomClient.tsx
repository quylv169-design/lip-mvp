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

const RIGHT_COL_W = 360;

const UI_FONT =
  'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

function labelOf(p: Participant) {
  // IMPORTANT: full name comes from token "name"
  return (p.name && p.name.trim()) || p.identity || "user";
}

function isTutor(p: Participant, tutorId?: string) {
  return !!tutorId && p.identity === tutorId;
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
    };
  }, [room]);

  return useMemo(() => {
    if (!room) return [];
    return [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
  }, [room, room?.localParticipant, room?.remoteParticipants.size]);
}

/** Attach a participant camera track to <video> if exists */
function CameraTile({ participant, tutorId }: { participant: Participant; tutorId?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const name = labelOf(participant);
  const role = isTutor(participant, tutorId) ? "Tutor" : "Student";

  const pub = participant.getTrackPublication(Track.Source.Camera);
  const camTrack = pub?.videoTrack;
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
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: isTutor(participant, tutorId)
              ? "rgba(120,170,255,0.12)"
              : "rgba(255,255,255,0.06)",
            opacity: 0.95,
            flex: "none",
          }}
        >
          {role}
        </div>
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

/** Center board: ONLY screenshare */
function Board() {
  const room = useRoomContext();

  const shareTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], {
    onlySubscribed: false,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shareTrack = shareTracks[0]?.publication?.videoTrack;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!shareTrack) return;

    shareTrack.attach(el);
    return () => {
      shareTrack.detach(el);
    };
  }, [shareTrack]);

  const hasShare = !!shareTrack;

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, opacity: 0.9 }}>Board</div>
          <LeaveButton to="/app" />
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
        {hasShare ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "black" }}
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
            <div style={{ maxWidth: 520 }}>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Chưa có “bảng”</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.9 }}>
                Tutor bấm <b>Share screen</b> để share slide/bảng.
                <br />
                Khu vực này chỉ hiển thị <b>screenshare</b>, không bao giờ hiện camera.
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
        const obj = JSON.parse(decoded) as { t: string; ts: number };
        setMessages((prev) => [
          ...prev,
          {
            id: `${obj.ts}-${participant?.identity ?? "unknown"}-${Math.random().toString(16).slice(2)}`,
            ts: obj.ts,
            from: participant ? labelOf(participant) : "system",
            text: obj.t,
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

function RightColumn({ tutorId }: { tutorId?: string }) {
  const room = useRoomContext();
  const { messages, text, setText, send } = useSimpleChat(room);

  const all = useAllParticipants(room);

  const top3 = useMemo(() => {
    const sorted = [...all].sort((a, b) => {
      const aIsTutor = isTutor(a, tutorId);
      const bIsTutor = isTutor(b, tutorId);
      if (aIsTutor === bIsTutor) return 0;
      return aIsTutor ? -1 : 1;
    });
    return sorted.slice(0, 3);
  }, [all, tutorId]);

  const tiles: Array<Participant | null> = [...top3];
  while (tiles.length < 3) tiles.push(null);

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
              <div key={p.identity} style={{ height: 110 }}>
                <CameraTile participant={p} tutorId={tutorId} />
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

function MinimalClassroomUI({ tutorId }: { tutorId?: string }) {
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
        <Board />
      </div>

      <div
        style={{
          borderLeft: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.02)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <RightColumn tutorId={tutorId} />
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
      <MinimalClassroomUI tutorId={info?.tutorId} />
    </LiveKitRoom>
  );
}
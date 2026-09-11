"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { CSSProperties, useEffect, useState } from "react";
import type { Participant } from "@/lib/participants";

type BallStyle = CSSProperties & {
  "--ball-index": number;
  "--ball-shift": string;
};

function ballStyle(index: number): BallStyle {
  const shifts = [-8, 5, -2, 9, -5, 3];
  return {
    "--ball-index": index,
    "--ball-shift": `${shifts[index % shifts.length]}%`,
  };
}

export function ScreenClient() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joinQr, setJoinQr] = useState("");
  const [selected, setSelected] = useState<Participant | null>(null);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("/api/participants", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as Participant[];
        if (active) setParticipants(next);
      } catch {
        // The next polling cycle retries automatically.
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 1500);

    const joinUrl = new URL("/join", window.location.origin).toString();
    void QRCode.toDataURL(joinUrl, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 520,
      color: { dark: "#000000", light: "#ffffff" },
    }).then((url) => {
      if (active) setJoinQr(url);
    });

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  return (
    <main className="screen-shell">
      <Image
        className="screen-logo"
        src="/logo_white.svg"
        alt="cre8"
        width={108}
        height={108}
        priority
      />

      <div className="screen-stage" aria-live="polite">
        <div className="ball-field">
          {participants.map((participant, index) => (
            <button
              type="button"
              className="participant-ball"
              key={participant.id}
              style={ballStyle(index)}
              onClick={() => setSelected(participant)}
              aria-label={`${participant.name} 소개 보기`}
            >
              <strong>{participant.name}</strong>
              <span>
                {participant.studentId} · {participant.major}
              </span>
              {(participant.workInterest || participant.personalInterest) && (
                <small>
                  {participant.workInterest || participant.personalInterest}
                </small>
              )}
            </button>
          ))}
        </div>
      </div>

      <aside className="screen-qr" aria-label="QR code">
        {joinQr ? (
          <Image src={joinQr} alt="" width={520} height={520} unoptimized />
        ) : (
          <div className="qr-loading" />
        )}
      </aside>

      {selected && (
        <section
          className="participant-detail"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.name} 소개`}
        >
          <button
            className="detail-close"
            type="button"
            onClick={() => setSelected(null)}
            aria-label="닫기"
          >
            ×
          </button>

          <header className="detail-header">
            <h1>{selected.name}</h1>
            <p>
              {selected.major} · {selected.studentId}
              {selected.subMajor && <span>{selected.subMajor}</span>}
            </p>
          </header>

          <div className="detail-field">
            {selected.workInterest && (
              <article className="detail-circle detail-circle-work">
                <span>작업 관심사</span>
                <p>{selected.workInterest}</p>
              </article>
            )}

            {selected.personalInterest && (
              <article className="detail-circle detail-circle-personal">
                <span>개인 관심사</span>
                <p>{selected.personalInterest}</p>
              </article>
            )}

            {selected.message && (
              <article className="detail-circle detail-circle-message">
                <span>하고 싶은 말</span>
                <p>{selected.message}</p>
              </article>
            )}

            {(selected.photos ?? []).map((photo, index) => (
              <figure
                className={`detail-photo detail-photo-${index + 1}`}
                key={photo}
              >
                {/* User uploads have dynamic data URLs or Supabase Storage URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={`${selected.name} 사진 ${index + 1}`} />
              </figure>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

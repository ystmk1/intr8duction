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
            <article
              className="participant-ball"
              key={participant.id}
              style={ballStyle(index)}
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
            </article>
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
    </main>
  );
}

"use client";

import Image from "next/image";
import QRCode from "qrcode";
import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useState,
} from "react";
import type { Participant } from "@/lib/participants";

type BallStyle = CSSProperties & {
  "--ball-index": number;
  "--ball-shift": string;
};

type DeleteMenu = {
  participant: Participant;
  x: number;
  y: number;
};

function ballStyle(index: number): BallStyle {
  const shifts = [-8, 5, -2, 9, -5, 3];
  return {
    "--ball-index": index,
    "--ball-shift": `${shifts[index % shifts.length]}%`,
  };
}

function withSuffix(value: string, suffix: string) {
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}

export function ScreenClient() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joinQr, setJoinQr] = useState("");
  const [selected, setSelected] = useState<Participant | null>(null);
  const [deleteMenu, setDeleteMenu] = useState<DeleteMenu | null>(null);
  const [deleteState, setDeleteState] = useState<
    "idle" | "deleting" | "error"
  >("idle");

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

  useEffect(() => {
    if (!deleteMenu) return;

    const closeMenu = () => setDeleteMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, [deleteMenu]);

  function openDeleteMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    participant: Participant,
  ) {
    event.preventDefault();
    setDeleteState("idle");
    setDeleteMenu({
      participant,
      x: Math.min(event.clientX, window.innerWidth - 132),
      y: Math.min(event.clientY, window.innerHeight - 96),
    });
  }

  async function confirmDelete() {
    if (!deleteMenu || deleteState === "deleting") return;

    const target = deleteMenu.participant;
    setDeleteState("deleting");

    try {
      const response = await fetch(`/api/participants/${target.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("delete failed");

      setParticipants((current) =>
        current.filter((participant) => participant.id !== target.id),
      );
      setSelected((current) => (current?.id === target.id ? null : current));
      setDeleteMenu(null);
      setDeleteState("idle");
    } catch {
      setDeleteState("error");
    }
  }

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
              onContextMenu={(event) => openDeleteMenu(event, participant)}
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
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>

          <header className="detail-header">
            <h1>{selected.name}</h1>
            <p>
              {withSuffix(selected.studentId, "학번")} {withSuffix(selected.major, "전공")}
              {selected.subMajor && ` ${selected.subMajor}`}
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

      {deleteMenu && (
        <div
          className="delete-menu"
          role="menu"
          aria-label={`${deleteMenu.participant.name} 삭제 메뉴`}
          style={{ left: deleteMenu.x, top: deleteMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={confirmDelete}
            disabled={deleteState === "deleting"}
          >
            {deleteState === "deleting"
              ? "삭제 중"
              : deleteState === "error"
                ? "다시 삭제"
                : "삭제"}
          </button>
          <button type="button" role="menuitem" onClick={() => setDeleteMenu(null)}>
            취소
          </button>
        </div>
      )}
    </main>
  );
}

"use client";

import Image from "next/image";
import QRCode from "qrcode";
import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useBallField } from "./use-ball-field";
import type { Participant } from "@/lib/participants";

type DeleteMenu = {
  participant: Participant;
  x: number;
  y: number;
};

function withSuffix(value: string, suffix: string) {
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}

function detailCopySize(value: string) {
  if (value.length > 190) return "detail-copy-xlong";
  if (value.length > 130) return "detail-copy-long";
  if (value.length > 70) return "detail-copy-medium";
  return "detail-copy-short";
}

/**
 * Hand-placed arrangement per number of circles, as percentages of the card.
 * These are compositions rather than a grid, so they are laid out by position
 * instead of being left to wrap.
 */
const detailLayouts: Record<number, readonly (readonly [number, number])[]> = {
  1: [[49, 50]],
  2: [
    [35, 55],
    [65, 55],
  ],
  3: [
    [25, 50],
    [51, 62],
    [78, 53],
  ],
  4: [
    [14, 50],
    [38, 58],
    [63, 50],
    [86, 59],
  ],
  5: [
    [23, 42],
    [50, 34],
    [77, 42],
    [40, 72],
    [64, 72],
  ],
  6: [
    [14, 48],
    [37, 34],
    [64, 32],
    [33, 72],
    [61, 72],
    [86, 58],
  ],
};

/** Falls back to an even row for counts the compositions do not cover. */
function placementFor(count: number, index: number) {
  const spot = detailLayouts[count]?.[index];
  if (spot) return spot;
  return [((index + 0.5) / count) * 100, 50] as const;
}

/**
 * The same clear space between the closest pair whatever the count, rather
 * than a share of the circle, so the compositions are spaced alike even though
 * their positions are deliberately uneven.
 */
const detailCircleGap = 0.029;

/**
 * Sized so the tightest pair in the composition lands on that gap. Sparse
 * arrangements would have to be enormous to reach it, so they stop at a
 * ceiling instead.
 */
function circleSizeFor(count: number, width: number, height: number) {
  const spots = detailLayouts[count];
  let closest = Infinity;

  for (let i = 0; spots && i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      const dx = ((spots[j][0] - spots[i][0]) / 100) * width;
      const dy = ((spots[j][1] - spots[i][1]) / 100) * height;
      closest = Math.min(closest, Math.hypot(dx, dy));
    }
  }

  const gap = Math.min(width, height) * detailCircleGap;
  const ceiling = Math.min(height * 0.56, width * 0.32);
  return Math.min(ceiling, closest - gap);
}

/** A photo lifted out of its circle and shown whole. */
type PhotoZoom = {
  src: string;
  alt: string;
  /** Where the circle sits, and the rectangle the photo opens out into. */
  from: { left: number; top: number; size: number };
  to: { left: number; top: number; width: number; height: number };
};

/** Largest rectangle of the photo's own shape that fits the screen. */
function zoomTarget(
  naturalWidth: number,
  naturalHeight: number,
  width: number,
  height: number,
) {
  const ratio =
    naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
  const fit = Math.min((width * 0.9) / ratio, height * 0.86);

  return {
    width: fit * ratio,
    height: fit,
    left: (width - fit * ratio) / 2,
    top: (height - fit) / 2,
  };
}

type DetailItem =
  | { kind: "copy"; key: string; label: string; text: string }
  | { kind: "photo"; key: string; src: string; position: number };

function detailItemsOf(participant: Participant): DetailItem[] {
  const copy: DetailItem[] = (
    [
      { key: "work", label: "작업 관심사", text: participant.workInterest },
      { key: "personal", label: "개인 관심사", text: participant.personalInterest },
      { key: "message", label: "하고 싶은 말", text: participant.message },
    ] as const
  )
    .filter((item) => Boolean(item.text))
    .map((item) => ({ kind: "copy", ...item }));

  const photos: DetailItem[] = (participant.photos ?? []).map((src, index) => ({
    kind: "photo",
    key: src,
    src,
    position: index + 1,
  }));

  return [...copy, ...photos];
}

export function ScreenClient() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joinQr, setJoinQr] = useState("");
  const [selected, setSelected] = useState<Participant | null>(null);
  const [deleteMenu, setDeleteMenu] = useState<DeleteMenu | null>(null);
  const [deleteState, setDeleteState] = useState<
    "idle" | "deleting" | "error"
  >("idle");

  const onWinner = useCallback((participant: Participant) => {
    setSelected(participant);
  }, []);

  const onReset = useCallback(() => {
    setSelected(null);
  }, []);

  // The circle size is worked out from the viewport, so the card needs to know
  // how big it is. Only changes on resize, so it costs nothing to watch.
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const read = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });

    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const { fieldRef, registerBall, drawn, notice, opening } = useBallField({
    participants,
    onWinner,
    onReset,
  });

  useEffect(() => {
    let active = true;
    let signature = "";

    async function refresh() {
      try {
        const response = await fetch("/api/participants", { cache: "no-store" });
        if (!response.ok) return;

        const body = await response.text();
        // Skip the state update when the roster is unchanged, so the ball
        // field is not re-rendered on every polling cycle.
        if (!active || body === signature) return;

        signature = body;
        setParticipants(JSON.parse(body) as Participant[]);
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

  const [zoom, setZoom] = useState<PhotoZoom | null>(null);
  const [zoomClosing, setZoomClosing] = useState(false);
  const zoomTimerRef = useRef(0);

  function openZoom(
    event: ReactMouseEvent<HTMLButtonElement>,
    src: string,
    alt: string,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const image = event.currentTarget.querySelector("img");

    window.clearTimeout(zoomTimerRef.current);
    setZoomClosing(false);
    setZoom({
      src,
      alt,
      from: { left: rect.left, top: rect.top, size: rect.width },
      to: zoomTarget(
        image?.naturalWidth ?? 0,
        image?.naturalHeight ?? 0,
        window.innerWidth,
        window.innerHeight,
      ),
    });
  }

  const closeZoom = useCallback(() => {
    // Run the opening backwards, then drop it once it is back over its circle.
    setZoomClosing(true);
    window.clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = window.setTimeout(() => {
      setZoom(null);
      setZoomClosing(false);
    }, 420);
  }, []);

  useEffect(() => () => window.clearTimeout(zoomTimerRef.current), []);

  const closeDetail = useCallback(() => {
    setSelected(null);
    setZoom(null);
    setZoomClosing(false);
  }, []);

  useEffect(() => {
    if (!selected) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // A zoomed photo is on top, so it goes first and the card stays open.
      if (zoom) closeZoom();
      else closeDetail();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeDetail, closeZoom, selected, zoom]);

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
      if (selected?.id === target.id) closeDetail();
      setDeleteMenu(null);
      setDeleteState("idle");
    } catch {
      setDeleteState("error");
    }
  }

  const detailItems = selected ? detailItemsOf(selected) : [];
  const detailFieldStyle =
    viewport.width && detailItems.length
      ? ({
          "--circle": `${Math.round(
            circleSizeFor(detailItems.length, viewport.width, viewport.height),
          )}px`,
        } as CSSProperties)
      : undefined;

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

      <div
        className="ball-field"
        ref={fieldRef}
        aria-label="참가자 공"
        aria-live="polite"
      >
        {participants.map((participant) => {
          const order = drawn.indexOf(participant.id);
          return (
            <ParticipantBall
              key={participant.id}
              participant={participant}
              order={order}
              covered={opening?.id === participant.id}
              registerBall={registerBall}
              onOpen={() => setSelected(participant)}
              onDeleteMenu={openDeleteMenu}
            />
          );
        })}
      </div>

      {/* The drawn ball, frozen where it was and opening out into the card. */}
      {opening && (
        <div
          className="draw-open"
          aria-hidden="true"
          style={
            {
              "--open-cx": `${opening.x}px`,
              "--open-cy": `${opening.y}px`,
              "--open-r": `${opening.r}px`,
              "--open-cover": `${opening.cover}px`,
            } as CSSProperties
          }
        />
      )}

      {notice && (
        <p className="screen-notice" role="status">
          {notice}
        </p>
      )}

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
            onClick={closeDetail}
            aria-label="닫기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>

          <header className="detail-header">
            <h1>{selected.name}</h1>
            <p>
              {withSuffix(selected.studentId, "학번")}{" "}
              {withSuffix(selected.major, "전공")}
              {selected.subMajor && ` ${selected.subMajor}`}
            </p>
            {selected.note && <p className="detail-note">{selected.note}</p>}
          </header>

          <div
            className="detail-field"
            data-items={detailItems.length}
            style={detailFieldStyle}
          >
            {detailItems.map((item, index) => {
              const [x, y] = placementFor(detailItems.length, index);
              const spot = { "--x": `${x}%`, "--y": `${y}%` } as CSSProperties;

              return item.kind === "copy" ? (
                <article
                  className={`detail-circle ${detailCopySize(item.text)}`}
                  key={item.key}
                  style={spot}
                >
                  <span>{item.label}</span>
                  <p>{item.text}</p>
                </article>
              ) : (
                <button
                  className="detail-photo"
                  key={item.key}
                  style={spot}
                  type="button"
                  onClick={(event) =>
                    openZoom(
                      event,
                      item.src,
                      `${selected.name} 사진 ${item.position}`,
                    )
                  }
                  aria-label={`${selected.name} 사진 ${item.position} 크게 보기`}
                >
                  {/* User uploads have dynamic data URLs or Supabase Storage URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.src} alt="" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {zoom && (
        <div
          className="photo-zoom-layer"
          role="dialog"
          aria-modal="true"
          aria-label={zoom.alt}
          data-closing={zoomClosing || undefined}
          onClick={closeZoom}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="photo-zoom"
            src={zoom.src}
            alt={zoom.alt}
            data-closing={zoomClosing || undefined}
            onClick={(event) => event.stopPropagation()}
            style={
              {
                "--from-x": `${zoom.from.left}px`,
                "--from-y": `${zoom.from.top}px`,
                "--from-size": `${zoom.from.size}px`,
                "--to-x": `${zoom.to.left}px`,
                "--to-y": `${zoom.to.top}px`,
                "--to-w": `${zoom.to.width}px`,
                "--to-h": `${zoom.to.height}px`,
              } as CSSProperties
            }
          />

          <button
            className="detail-close photo-zoom-close"
            type="button"
            onClick={closeZoom}
            aria-label="사진 닫기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>
        </div>
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
          <button
            type="button"
            role="menuitem"
            onClick={() => setDeleteMenu(null)}
          >
            취소
          </button>
        </div>
      )}
    </main>
  );
}

type BallProps = {
  participant: Participant;
  /** Position in the draw order, or -1 while the ball is still in the pool. */
  order: number;
  /** True while the expanding circle sits exactly on top of this ball. */
  covered: boolean;
  registerBall: (id: string, node: HTMLElement | null) => void;
  onOpen: () => void;
  onDeleteMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    participant: Participant,
  ) => void;
};

function ParticipantBall({
  participant,
  order,
  covered,
  registerBall,
  onOpen,
  onDeleteMenu,
}: BallProps) {
  const nodeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    registerBall(participant.id, node);
    return () => registerBall(participant.id, null);
  }, [participant.id, registerBall]);

  return (
    <button
      type="button"
      className="participant-ball"
      ref={nodeRef}
      data-drawn={order >= 0 || undefined}
      data-covered={covered || undefined}
      onClick={onOpen}
      onContextMenu={(event) => onDeleteMenu(event, participant)}
      aria-label={`${participant.name}, ${participant.studentId}학번, ${participant.major}전공 소개 보기${order >= 0 ? ` (${order + 1}번째 추첨)` : ""}`}
    >
      <strong>{participant.name}</strong>
      <span className="ball-meta">
        <span>{withSuffix(participant.studentId, "학번")}</span>
        <span>{withSuffix(participant.major, "전공")}</span>
      </span>
      {order >= 0 && (
        <em className="ball-order" aria-hidden="true">
          {order + 1}
        </em>
      )}
    </button>
  );
}

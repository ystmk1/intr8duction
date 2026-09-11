"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  createBall,
  kickBall,
  scatterBall,
  stepWorld,
  type Ball,
  type Rect,
} from "./ball-physics";
import type { Participant } from "@/lib/participants";

export type DrawPhase = "idle" | "spinning" | "revealing" | "shown";

/** How long the balls whirl before the winner is pulled out. */
const SPIN_MS = 1800;
/** How long the winning ball flies to the centre before the card opens. */
const REVEAL_MS = 820;
const SPIN_SPEED_FACTOR = 3.4;
const CAPTURE_SCALE = 1.85;
/** Extra clearance around the fixed UI blocks the balls bounce off. */
const OBSTACLE_PADDING = 10;
const NOTICE_MS = 2400;

type Options = {
  participants: Participant[];
  onWinner: (participant: Participant) => void;
  onReset: () => void;
};

/** Balls shrink as the field fills up, so ~26% of the screen stays covered. */
function radiusFor(count: number, width: number, height: number) {
  if (count < 1) return 0;
  const ideal = Math.sqrt((width * height * 0.26) / (Math.PI * count));
  return Math.max(38, Math.min(ideal, 148));
}

function baseSpeed(width: number, height: number) {
  return Math.min(width, height) * 0.15;
}

/** Unbiased pick, so the draw is fair even on a tiny pool. */
function randomIndex(length: number) {
  if (length < 2) return 0;

  const limit = Math.floor(0xffffffff / length) * length;
  const buffer = new Uint32Array(1);
  let value = 0;

  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % length;
}

export function useBallField({ participants, onWinner, onReset }: Options) {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const ballsRef = useRef<Ball[]>([]);
  const obstaclesRef = useRef<Rect[]>([]);
  const sizeRef = useRef({ width: 0, height: 0 });
  const reducedMotionRef = useRef(false);

  const participantsRef = useRef(participants);
  const drawnRef = useRef<string[]>([]);
  const phaseRef = useRef<DrawPhase>("idle");
  const captureRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const noticeTimerRef = useRef(0);
  const callbacksRef = useRef({ onWinner, onReset });

  const [phase, setPhase] = useState<DrawPhase>("idle");
  const [drawn, setDrawn] = useState<string[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useLayoutEffect(() => {
    callbacksRef.current = { onWinner, onReset };
  }, [onReset, onWinner]);

  const registerBall = useCallback((id: string, node: HTMLElement | null) => {
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;

    const bounds = field.getBoundingClientRect();
    sizeRef.current = { width: bounds.width, height: bounds.height };

    const blocks = document.querySelectorAll<HTMLElement>("[data-ball-block]");
    obstaclesRef.current = Array.from(blocks).map((block) => {
      const rect = block.getBoundingClientRect();
      return {
        left: rect.left - bounds.left - OBSTACLE_PADDING,
        top: rect.top - bounds.top - OBSTACLE_PADDING,
        right: rect.right - bounds.left + OBSTACLE_PADDING,
        bottom: rect.bottom - bounds.top + OBSTACLE_PADDING,
      };
    });
  }, []);

  // The QR image and the counter change size as the event runs, so the blocks
  // the balls bounce off are re-measured after every render.
  useLayoutEffect(measure);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = query.matches;

    const onChange = () => {
      reducedMotionRef.current = query.matches;
    };

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Keep one ball per participant: new arrivals rise in from below the screen.
  useLayoutEffect(() => {
    participantsRef.current = participants;

    const { width, height } = sizeRef.current;
    if (!width || !height) return;

    const radius = radiusFor(participants.length, width, height);
    const existing = new Map(ballsRef.current.map((ball) => [ball.id, ball]));

    ballsRef.current = participants.map((participant) => {
      const ball =
        existing.get(participant.id) ??
        createBall(participant.id, width, height, radius);
      ball.r = radius;
      return ball;
    });

    setDrawn((current) => {
      const kept = current.filter((id) =>
        participants.some((participant) => participant.id === id),
      );
      return kept.length === current.length ? current : kept;
    });
  }, [participants]);

  useEffect(() => {
    drawnRef.current = drawn;
  }, [drawn]);

  useEffect(() => {
    function onResize() {
      measure();
      const { width, height } = sizeRef.current;
      if (!width || !height) return;

      const radius = radiusFor(ballsRef.current.length, width, height);
      for (const ball of ballsRef.current) {
        ball.r = radius;
        ball.x = Math.max(radius, Math.min(ball.x, width - radius));
        ball.y = Math.max(radius, Math.min(ball.y, height - radius));
      }
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  // Simulation loop. Positions are written straight to the DOM so that the
  // React tree only re-renders when the roster or the draw state changes.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    function tick(now: number) {
      frame = requestAnimationFrame(tick);

      const dt = (now - last) / 1000;
      last = now;

      const { width, height } = sizeRef.current;
      if (!width || !height) return;

      const balls = ballsRef.current;
      const spinning = phaseRef.current === "spinning";
      const calm = reducedMotionRef.current;

      stepWorld(balls, dt, {
        width,
        height,
        obstacles: obstaclesRef.current,
        speed:
          baseSpeed(width, height) *
          (calm ? 0.18 : spinning ? SPIN_SPEED_FACTOR : 1),
        spin: spinning && !calm,
        captureId: captureRef.current,
        captureX: width / 2,
        captureY: height / 2,
        captureScale: CAPTURE_SCALE,
      });

      for (const ball of balls) {
        const node = nodesRef.current.get(ball.id);
        if (!node) continue;

        if (ball.renderedR !== ball.r) {
          node.style.width = `${ball.r * 2}px`;
          node.style.height = `${ball.r * 2}px`;
          node.style.setProperty("--ball-r", `${ball.r}px`);
          ball.renderedR = ball.r;
        }

        node.style.transform =
          `translate3d(${ball.x - ball.r}px, ${ball.y - ball.r}px, 0)` +
          ` rotate(${ball.rot.toFixed(2)}deg) scale(${ball.scale.toFixed(3)})`;
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const applyPhase = useCallback((next: DrawPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  const showNotice = useCallback((text: string) => {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(text);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), NOTICE_MS);
  }, []);

  const startDraw = useCallback(() => {
    if (phaseRef.current !== "idle") return;

    const roster = participantsRef.current;
    if (roster.length === 0) {
      showNotice("아직 참가자가 없습니다");
      return;
    }

    const pool = roster.filter(
      (participant) => !drawnRef.current.includes(participant.id),
    );

    if (pool.length === 0) {
      showNotice("모두 추첨했습니다 · Ctrl + Shift + R 로 초기화");
      return;
    }

    const winner = pool[randomIndex(pool.length)];
    applyPhase("spinning");

    timersRef.current.push(
      window.setTimeout(() => {
        applyPhase("revealing");
        captureRef.current = winner.id;
        setWinnerId(winner.id);

        timersRef.current.push(
          window.setTimeout(() => {
            setDrawn((current) =>
              current.includes(winner.id) ? current : [...current, winner.id],
            );
            applyPhase("shown");
            callbacksRef.current.onWinner(winner);
          }, REVEAL_MS),
        );
      }, SPIN_MS),
    );
  }, [applyPhase, showNotice]);

  /**
   * Ends a draw at any stage — card closed, spin aborted, ball clicked — and
   * returns the held ball to the field with a fresh kick.
   */
  const endDraw = useCallback(() => {
    clearTimers();

    const id = captureRef.current;
    captureRef.current = null;
    setWinnerId(null);

    const ball = ballsRef.current.find((candidate) => candidate.id === id);
    if (ball) kickBall(ball);

    applyPhase("idle");
  }, [applyPhase, clearTimers]);

  const resetDraw = useCallback(() => {
    clearTimers();
    captureRef.current = null;
    setWinnerId(null);
    setDrawn([]);
    applyPhase("idle");

    const { width, height } = sizeRef.current;
    if (width && height) {
      for (const ball of ballsRef.current) scatterBall(ball, width, height);
    }

    callbacksRef.current.onReset();
    showNotice("추첨을 초기화했습니다");
  }, [applyPhase, clearTimers, showNotice]);

  // Ctrl + Shift on its own draws; Ctrl + Shift + R resets. The draw fires on
  // key-up so that a chord continuing into another key (R) never triggers it.
  useEffect(() => {
    let armed = false;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Control" || event.key === "Shift") {
        if (event.ctrlKey && event.shiftKey) armed = true;
        return;
      }

      if (event.key === "Alt" || event.key === "Meta") return;

      armed = false;

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        resetDraw();
        return;
      }

      // Escape backs out of a spin that has not produced a card yet.
      if (event.key === "Escape" && phaseRef.current === "spinning") {
        endDraw();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key !== "Control" && event.key !== "Shift") return;
      if (!armed) return;

      armed = false;
      startDraw();
    }

    function disarm() {
      armed = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", disarm);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", disarm);
    };
  }, [endDraw, resetDraw, startDraw]);

  useEffect(
    () => () => {
      clearTimers();
      window.clearTimeout(noticeTimerRef.current);
    },
    [clearTimers],
  );

  return {
    fieldRef,
    registerBall,
    phase,
    drawn,
    winnerId,
    notice,
    startDraw,
    endDraw,
    resetDraw,
  };
}

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
  scatterBall,
  stepWorld,
  type Ball,
} from "./ball-physics";
import type { Participant } from "@/lib/participants";

const NOTICE_MS = 2400;

type Options = {
  participants: Participant[];
  onWinner: (participant: Participant) => void;
  onReset: () => void;
};

/** Keep the field airy; even a one-person roster never produces a giant ball. */
function radiusFor(count: number, width: number, height: number) {
  if (count < 1) return 0;
  const ideal = Math.sqrt((width * height * 0.05) / (Math.PI * count));
  const viewportCap = Math.min(54, Math.min(width, height) * 0.062);
  return Math.max(18, Math.min(ideal, viewportCap));
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
  const sizeRef = useRef({ width: 0, height: 0 });
  const reducedMotionRef = useRef(false);

  const participantsRef = useRef(participants);
  const drawnRef = useRef<string[]>([]);
  const noticeTimerRef = useRef(0);
  const callbacksRef = useRef({ onWinner, onReset });

  const [drawn, setDrawn] = useState<string[]>([]);
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
  }, []);

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

    ballsRef.current = participants.map((participant, index) => {
      const ball =
        existing.get(participant.id) ??
        createBall(
          participant.id,
          width,
          height,
          radius,
          index,
          participants.length,
        );
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
  // React tree only re-renders when the roster or the drawn list changes.
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

      stepWorld(balls, dt, {
        width,
        height,
        speed: baseSpeed(width, height) * (reducedMotionRef.current ? 0.18 : 1),
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

        node.style.transform = `translate3d(${ball.x - ball.r}px, ${ball.y - ball.r}px, 0)`;
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const showNotice = useCallback((text: string) => {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(text);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), NOTICE_MS);
  }, []);

  /** Picks one participant who has not come up yet and opens their card. */
  const startDraw = useCallback(() => {
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

    // Written through the ref as well, so a second press in the same frame
    // cannot land on the same person.
    drawnRef.current = [...drawnRef.current, winner.id];
    setDrawn(drawnRef.current);
    callbacksRef.current.onWinner(winner);
  }, [showNotice]);

  const resetDraw = useCallback(() => {
    drawnRef.current = [];
    setDrawn([]);

    const { width, height } = sizeRef.current;
    if (width && height) {
      for (const [index, ball] of ballsRef.current.entries()) {
        scatterBall(ball, width, height, index, ballsRef.current.length);
      }
    }

    callbacksRef.current.onReset();
    showNotice("추첨을 초기화했습니다");
  }, [showNotice]);

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
  }, [resetDraw, startDraw]);

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  return { fieldRef, registerBall, drawn, notice, startDraw, resetDraw };
}

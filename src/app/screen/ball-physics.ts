/**
 * Screensaver-style ball field for the event monitor.
 *
 * Every ball holds one constant speed and only ever changes direction: it
 * reflects off the viewport edges and bounces off the other balls as an equal
 * mass, never overlapping them. There is no gravity and nothing ever settles.
 */

export type Ball = {
  id: string;
  /** Centre position in CSS pixels, relative to the ball field. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Current rotation in degrees, and the resting tilt it springs back to. */
  rot: number;
  tilt: number;
  /** True while the ball is still rising in from below the bottom edge. */
  entering: boolean;
  /** Last radius written to the DOM, so we only touch layout when it changes. */
  renderedR: number;
};

export type WorldOptions = {
  width: number;
  height: number;
  /** The speed every ball holds, in px/s. */
  speed: number;
};

const SUBSTEP = 1 / 120;
const MAX_FRAME = 0.06;
const MAX_TILT = 14;
/**
 * Separating one pair pushes a ball into the next one, so the contacts are
 * relaxed a few times per substep before the field is squeezed back in bounds.
 */
const RELAX_PASSES = 3;

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

/** Exponential approach that behaves the same at any frame rate. */
function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function createBall(
  id: string,
  width: number,
  height: number,
  r: number,
): Ball {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
  return {
    id,
    x: clamp(width * (0.2 + Math.random() * 0.6), r, Math.max(r, width - r)),
    y: height + r + Math.random() * height * 0.35,
    vx: Math.cos(angle),
    vy: Math.sin(angle),
    r,
    rot: 0,
    tilt: (Math.random() - 0.5) * 2 * MAX_TILT,
    entering: true,
    renderedR: -1,
  };
}

/** Drops a ball at a random spot inside the field with a random heading. */
export function scatterBall(ball: Ball, width: number, height: number) {
  const angle = Math.random() * Math.PI * 2;
  ball.x = clamp(
    width * (0.08 + Math.random() * 0.84),
    ball.r,
    Math.max(ball.r, width - ball.r),
  );
  ball.y = clamp(
    height * (0.08 + Math.random() * 0.84),
    ball.r,
    Math.max(ball.r, height - ball.r),
  );
  ball.vx = Math.cos(angle);
  ball.vy = Math.sin(angle);
  ball.entering = false;
}

/** Sends a ball off in a fresh random direction, keeping where it is. */
export function kickBall(ball: Ball) {
  const angle = Math.random() * Math.PI * 2;
  ball.vx = Math.cos(angle);
  ball.vy = Math.sin(angle);
}

export function stepWorld(balls: Ball[], dt: number, options: WorldOptions) {
  let remaining = Math.min(dt, MAX_FRAME);

  while (remaining > 0) {
    const h = Math.min(SUBSTEP, remaining);
    integrate(balls, h, options);

    for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
      resolveBallCollisions(balls);
    }

    // Contact relaxation can shove a ball through a wall, so the edges always
    // get the last word.
    containBalls(balls, options);
    remaining -= h;
  }
}

function containBalls(balls: Ball[], options: WorldOptions) {
  for (const ball of balls) {
    if (!ball.entering) bounceOffWalls(ball, options.width, options.height);
  }
}

function integrate(balls: Ball[], h: number, options: WorldOptions) {
  const { width, height, speed } = options;

  for (const ball of balls) {
    // Every ball holds exactly the target speed, so a collision only ever
    // changes its direction — never leaves it crawling or stopped.
    const current = Math.hypot(ball.vx, ball.vy);
    if (current < 1e-4) {
      kickBall(ball);
    } else {
      const factor = speed / current;
      ball.vx *= factor;
      ball.vy *= factor;
    }

    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    if (ball.entering) {
      // Still rising in from below: no wall can stop it until it is inside.
      if (ball.y <= height - ball.r) ball.entering = false;
    } else {
      bounceOffWalls(ball, width, height);
    }

    const target = ball.tilt + clamp(ball.vx * 0.02, -MAX_TILT, MAX_TILT);
    ball.rot = approach(ball.rot, target, 3, h);
  }
}

/** Reflects off an edge, with a little angle jitter so orbits never lock in. */
function reflect(ball: Ball, nx: number, ny: number) {
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot >= 0) return;

  const vx = ball.vx - 2 * dot * nx;
  const vy = ball.vy - 2 * dot * ny;

  const jitter = (Math.random() - 0.5) * 0.12;
  const cos = Math.cos(jitter);
  const sin = Math.sin(jitter);
  ball.vx = vx * cos - vy * sin;
  ball.vy = vx * sin + vy * cos;
}

function bounceOffWalls(ball: Ball, width: number, height: number) {
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    reflect(ball, 1, 0);
  } else if (ball.x + ball.r > width) {
    ball.x = width - ball.r;
    reflect(ball, -1, 0);
  }

  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    reflect(ball, 0, 1);
  } else if (ball.y + ball.r > height) {
    ball.y = height - ball.r;
    reflect(ball, 0, -1);
  }
}

/** Equal-mass elastic collisions: the balls swap their normal velocities. */
function resolveBallCollisions(balls: Ball[]) {
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];
    if (a.entering) continue;

    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      if (b.entering) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minimum = a.r + b.r;
      const squared = dx * dx + dy * dy;
      if (squared >= minimum * minimum || squared < 1e-9) continue;

      const distance = Math.sqrt(squared);
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = (minimum - distance) * 0.5;

      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative >= 0) continue;

      a.vx += relative * nx;
      a.vy += relative * ny;
      b.vx -= relative * nx;
      b.vy -= relative * ny;
    }
  }
}

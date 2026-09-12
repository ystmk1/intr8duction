/**
 * Screensaver-style ball field for the event monitor.
 *
 * Each ball holds its own constant speed and only ever changes direction: it
 * reflects off the viewport edges and bounces off the other balls as an equal
 * mass, keeping clear space between them. There is no gravity and nothing ever
 * settles.
 */

export type Ball = {
  id: string;
  /** Centre position in CSS pixels, relative to the ball field. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /**
   * Per-ball multiplier on the world speed. Identical speeds keep a spawned
   * row travelling in lockstep, so each ball drifts a little faster or slower
   * than its neighbours and the formation breaks itself up.
   */
  speedScale: number;
  /** True while the ball is still rising in from below the bottom edge. */
  entering: boolean;
  /**
   * Lowest point an entering ball may be pushed back to. Nothing contains a
   * ball below the screen, so without this a settled ball can shove an
   * arriving one further down for good and it never appears.
   */
  entryFloor: number;
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

const WALL_MARGIN = 10;
/** Clear red space kept between two balls, as a share of their radii. */
const SEPARATION = 1.17;
/**
 * Spread of the per-ball speed multiplier around 1. Just enough that the row
 * they spawn in does not travel as one: at exactly equal speeds the roster
 * stays clumped, but anything past a few percent only makes the quickest ball
 * fast enough to smear.
 */
const SPEED_SPREAD = 0.06;
/**
 * Separating one pair pushes a ball into the next one, so the contacts are
 * relaxed a few times per substep before the field is squeezed back in bounds.
 */
const RELAX_PASSES = 7;

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

export function createBall(
  id: string,
  width: number,
  height: number,
  r: number,
  spawnIndex = 0,
  spawnCount = 1,
): Ball {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
  const step = r * 2 * SEPARATION;
  const availableWidth = Math.max(0, width - WALL_MARGIN * 2 - r * 2);
  const maxColumns = Math.max(1, Math.floor(availableWidth / step) + 1);
  const columns = Math.min(spawnCount, maxColumns);
  const column = spawnIndex % columns;
  const row = Math.floor(spawnIndex / columns);
  const rowWidth = (columns - 1) * step;
  const spawnY = height + WALL_MARGIN + r + row * step;

  return {
    id,
    x: width / 2 - rowWidth / 2 + column * step,
    y: spawnY,
    entryFloor: spawnY,
    vx: Math.cos(angle),
    vy: Math.sin(angle),
    r,
    speedScale: 1 + (Math.random() - 0.5) * 2 * SPEED_SPREAD,
    entering: true,
    renderedR: -1,
  };
}

/** Places the reset roster on a non-overlapping grid with random headings. */
export function scatterBall(
  ball: Ball,
  width: number,
  height: number,
  index = 0,
  count = 1,
) {
  const angle = Math.random() * Math.PI * 2;
  const step = ball.r * 2 * SEPARATION;
  const availableWidth = Math.max(
    0,
    width - WALL_MARGIN * 2 - ball.r * 2,
  );
  const maxColumns = Math.max(1, Math.floor(availableWidth / step) + 1);
  const columns = Math.min(count, maxColumns);
  const rows = Math.ceil(count / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const rowWidth = (Math.min(columns, count - row * columns) - 1) * step;
  const gridHeight = (rows - 1) * step;

  ball.x = clamp(
    width / 2 - rowWidth / 2 + column * step,
    ball.r + WALL_MARGIN,
    Math.max(ball.r + WALL_MARGIN, width - ball.r - WALL_MARGIN),
  );
  ball.y = clamp(
    height / 2 - gridHeight / 2 + row * step,
    ball.r + WALL_MARGIN,
    Math.max(ball.r + WALL_MARGIN, height - ball.r - WALL_MARGIN),
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
    if (!ball.entering) {
      bounceOffWalls(ball, options.width, options.height);
      continue;
    }

    // Still outside the field, where the walls do not apply. Hold it inside
    // the side edges and never let a contact push it below where it started,
    // so every arriving ball is guaranteed to make it onto the screen.
    const minX = ball.r + WALL_MARGIN;
    const maxX = Math.max(minX, options.width - ball.r - WALL_MARGIN);
    ball.x = clamp(ball.x, minX, maxX);
    ball.y = Math.min(ball.y, ball.entryFloor);
  }
}

function integrate(balls: Ball[], h: number, options: WorldOptions) {
  const { width, height, speed } = options;

  for (const ball of balls) {
    // Every ball holds exactly its own target speed, so a collision only ever
    // changes its direction — never leaves it crawling or stopped.
    const target = speed * ball.speedScale;
    const current = Math.hypot(ball.vx, ball.vy);
    if (current < 1e-4) {
      kickBall(ball);
    } else {
      const factor = target / current;
      ball.vx *= factor;
      ball.vy *= factor;
    }

    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    if (ball.entering) {
      // Still rising in from below: no wall can stop it until it is inside.
      if (ball.y <= height - ball.r - WALL_MARGIN) {
        ball.entering = false;
        // Released on its own heading. Keeping the near-vertical spawn angle
        // would march the whole roster up the screen as one locked row.
        const spread = Math.PI * (0.15 + Math.random() * 0.7);
        ball.vx = Math.cos(-spread) * target;
        ball.vy = Math.sin(-spread) * target;
        if (Math.random() < 0.5) ball.vx = -ball.vx;
      }
    } else {
      bounceOffWalls(ball, width, height);
    }
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
  const minX = ball.r + WALL_MARGIN;
  const maxX = Math.max(minX, width - ball.r - WALL_MARGIN);
  const minY = ball.r + WALL_MARGIN;
  const maxY = Math.max(minY, height - ball.r - WALL_MARGIN);

  if (ball.x < minX) {
    ball.x = minX;
    reflect(ball, 1, 0);
  } else if (ball.x > maxX) {
    ball.x = maxX;
    reflect(ball, -1, 0);
  }

  if (ball.y < minY) {
    ball.y = minY;
    reflect(ball, 0, 1);
  } else if (ball.y > maxY) {
    ball.y = maxY;
    reflect(ball, 0, -1);
  }
}

/** Equal-mass elastic collisions: the balls swap their normal velocities. */
function resolveBallCollisions(balls: Ball[]) {
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];

    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const minimum = (a.r + b.r) * SEPARATION;
      let squared = dx * dx + dy * dy;
      if (squared >= minimum * minimum) continue;

      // Two balls can occasionally receive the same point after a resize.
      // Give that degenerate pair a stable direction so it cannot stay fused.
      if (squared < 1e-9) {
        const angle = ((i + 1) * 1.618 + (j + 1) * 0.73) * Math.PI;
        dx = Math.cos(angle) * 0.001;
        dy = Math.sin(angle) * 0.001;
        squared = dx * dx + dy * dy;
      }

      const distance = Math.sqrt(squared);
      const nx = dx / distance;
      const ny = dy / distance;
      const push = minimum - distance;

      // An arriving ball parts the crowd instead of being jostled by it.
      // Sharing the push let the balls already on screen hold a newcomer down
      // below the bottom edge, where nothing could bring it back.
      const aHeld = a.entering && !b.entering;
      const bHeld = b.entering && !a.entering;
      const aShare = aHeld ? 0 : bHeld ? 1 : 0.5;
      const bShare = 1 - aShare;

      a.x -= nx * push * aShare;
      a.y -= ny * push * aShare;
      b.x += nx * push * bShare;
      b.y += ny * push * bShare;

      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative >= 0) continue;

      if (aHeld) {
        // a is immovable this frame: b simply reflects off it.
        b.vx -= 2 * relative * nx;
        b.vy -= 2 * relative * ny;
      } else if (bHeld) {
        a.vx += 2 * relative * nx;
        a.vy += 2 * relative * ny;
      } else {
        a.vx += relative * nx;
        a.vy += relative * ny;
        b.vx -= relative * nx;
        b.vy -= relative * ny;
      }
    }
  }
}

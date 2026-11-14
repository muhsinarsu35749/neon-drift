import Phaser from "phaser";
import { LAPS, TRACKS, poseAt, type StateSnapshot, type Track } from "@neon/shared";

const PALETTE = [0x5cffd6, 0xff3d8a, 0xffc857, 0x9eb6ff];

export class RaceView {
  private held = new Set<string>();
  private game: Phaser.Game | null = null;
  private trackGfx: Phaser.GameObjects.Graphics | null = null;
  private dynGfx: Phaser.GameObjects.Graphics | null = null;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private spaceWas = false;
  private drawnTrack = 0;
  private focusX = 0;
  private focusY = 0;
  private snap: StateSnapshot | null = null;
  private me = "";
  private scene: Phaser.Scene | null = null;

  constructor(private root: HTMLElement) {
    const typing = (event: KeyboardEvent) =>
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement;
    window.addEventListener("keydown", (event) => {
      if (typing(event)) return;
      this.held.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    });
    window.addEventListener("keyup", (event) => {
      this.held.delete(event.code);
    });
    window.addEventListener("blur", () => this.held.clear());
  }

  ensure() {
    if (this.game) return;
    const race = this;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.root,
      backgroundColor: "#07080c",
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      scene: {
        create() { race.attach(this); },
        update() { race.draw(); },
      },
      banner: false,
    });
  }

  sync(snap: StateSnapshot | null, me: string) {
    this.snap = snap;
    this.me = me;
  }

  readDrive() {
    const down = (...codes: string[]) => codes.some((code) => this.held.has(code));
    const left = down("KeyA", "ArrowLeft");
    const right = down("KeyD", "ArrowRight");
    const throttle = down("KeyW", "ArrowUp");
    const brake = down("KeyS", "ArrowDown");
    return {
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      throttle: throttle ? 1 : 0,
      brake: brake ? 1 : 0,
    };
  }

  consumeItem() {
    const down = this.held.has("Space");
    const edge = down && !this.spaceWas;
    this.spaceWas = down;
    return edge;
  }

  private attach(scene: Phaser.Scene) {
    this.scene = scene;
    this.trackGfx = scene.add.graphics();
    this.dynGfx = scene.add.graphics();
    scene.input.keyboard?.addCapture(["SPACE", "UP", "DOWN", "LEFT", "RIGHT", "W", "A", "S", "D"]);
  }

  private draw() {
    if (!this.dynGfx || !this.trackGfx || !this.scene || !this.snap) return;
    const track = TRACKS.find((item) => item.id === this.snap?.trackId);
    if (!track) return;
    if (this.drawnTrack !== track.id) {
      this.drawTrack(track);
      this.drawnTrack = track.id;
      this.focusX = track.bounds.cx;
      this.focusY = track.bounds.cy;
    }
    const g = this.dynGfx;
    g.clear();
    for (const oil of this.snap.oils) {
      g.fillStyle(0x24180f, 0.85);
      g.fillEllipse(oil.x, oil.y, 46, 26);
    }
    for (const item of this.snap.items) {
      const color = item.type === "boost" ? 0x5cffd6 : item.type === "shield" ? 0x8eb6ff : item.type === "emp" ? 0xd56bff : 0x6b5344;
      g.fillStyle(color, 1);
      g.fillCircle(item.x, item.y, 12);
      g.lineStyle(2, 0x07080c, 1);
      g.strokeCircle(item.x, item.y, 12);
    }
    const seen = new Set<string>();
    this.snap.players.forEach((player, index) => {
      seen.add(player.id);
      const color = PALETTE[index % PALETTE.length];
      const mine = player.id === this.me;
      const alpha = player.invisible ? (mine ? 0.45 : 0.12) : 1;
      this.drawCar(g, player.x, player.y, player.angle, player.carId, color, alpha, player.boost, player.shield, player.spinning);
      let label = this.labels.get(player.id);
      if (!label) {
        label = this.scene!.add.text(player.x, player.y, player.name, {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "14px",
          color: "#e7f2ea",
        }).setOrigin(0.5, 1);
        this.labels.set(player.id, label);
      }
      label.setText(player.name);
      label.setPosition(player.x, player.y - 46);
      label.setAlpha(player.invisible && !mine ? 0.15 : 1);
    });
    for (const [id, label] of this.labels) {
      if (!seen.has(id)) {
        label.destroy();
        this.labels.delete(id);
      }
    }
    const me = this.snap.players.find((player) => player.id === this.me) ?? this.snap.players[0];
    if (me) {
      this.focusX += (me.x - this.focusX) * 0.12;
      this.focusY += (me.y - this.focusY) * 0.12;
    }
    const cam = this.scene.cameras.main;
    const zoom = Phaser.Math.Clamp(cam.height / 620, 0.55, 1.45);
    cam.setZoom(zoom);
    cam.centerOn(this.focusX, this.focusY);
  }

  private drawTrack(track: Track) {
    const g = this.trackGfx;
    if (!g) return;
    g.clear();
    const pad = 900;
    const left = track.bounds.minX - pad;
    const top = track.bounds.minY - pad;
    const width = track.bounds.maxX - track.bounds.minX + pad * 2;
    const height = track.bounds.maxY - track.bounds.minY + pad * 2;
    g.fillStyle(0x070814, 1);
    g.fillRect(left, top, width, height);
    drawCity(g, track, left, top, width, height);
    strokeLoop(g, track, track.width + 22, 0x241c33, 1);
    strokeLoop(g, track, track.width + 8, 0xff3d8a, 0.55);
    strokeLoop(g, track, track.width + 4, 0x5cffd6, 0.7);
    strokeLoop(g, track, track.width, 0x171c2b, 1);
    drawLamps(g, track);
    for (let along = 0; along < track.length; along += 96) {
      const a = poseAt(track.points, track.length, along);
      const b = poseAt(track.points, track.length, along + 26);
      g.lineStyle(3, 0xd7fff6, 0.28);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokePath();
    }
    for (const gate of track.gates) {
      g.lineStyle(gate.finish ? 7 : 3, gate.finish ? 0xff3d8a : 0xd5fff4, gate.finish ? 0.95 : 0.4);
      g.beginPath();
      g.moveTo(gate.ax, gate.ay);
      g.lineTo(gate.bx, gate.by);
      g.strokePath();
    }
  }

  private drawCar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    carId: string,
    color: number,
    alpha: number,
    boost: boolean,
    shield: boolean,
    spinning: boolean,
  ) {
    const body = CAR_BODY[carId] ?? CAR_BODY.volt;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rot = (lx: number, ly: number) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });
    const fill = (pts: number[][], tint: number, a = alpha) => {
      g.fillStyle(tint, a);
      g.beginPath();
      const first = rot(pts[0][0], pts[0][1]);
      g.moveTo(first.x, first.y);
      for (const [lx, ly] of pts.slice(1)) {
        const point = rot(lx, ly);
        g.lineTo(point.x, point.y);
      }
      g.closePath();
      g.fillPath();
    };
    const half = body.length / 2;
    const wide = body.width / 2;
    g.fillStyle(0x05060a, alpha * 0.5);
    g.fillEllipse(x, y + 7, body.length * 1.08, body.width * 1.35);
    if (boost) {
      fill([[-half, 0], [-half - 18, 8], [-half - 18, -8]], 0xffc857);
      fill([[-half + 2, 0], [-half - 10, 3.5], [-half - 10, -3.5]], 0xfff1c9);
    }
    fill([
      [half, 0],
      [half - body.nose, wide * 0.9],
      [half * 0.2, wide],
      [-half * 0.5, wide * 0.94],
      [-half + 3, wide * 0.62],
      [-half, wide * 0.34],
      [-half, -wide * 0.34],
      [-half + 3, -wide * 0.62],
      [-half * 0.5, -wide * 0.94],
      [half * 0.2, -wide],
      [half - body.nose, -wide * 0.9],
    ], color);
    fill([
      [half * 0.18, wide * 0.58],
      [-half * 0.34, wide * 0.64],
      [-half * 0.46, wide * 0.36],
      [-half * 0.46, -wide * 0.36],
      [-half * 0.34, -wide * 0.64],
      [half * 0.18, -wide * 0.58],
    ], 0x10141c, alpha * 0.94);
    fill([
      [half * 0.08, wide * 0.36],
      [-half * 0.22, wide * 0.4],
      [-half * 0.22, -wide * 0.4],
      [half * 0.08, -wide * 0.36],
    ], 0xb7e9ff, alpha * 0.88);
    for (const side of [1, -1]) {
      fill([
        [half - 1, side * wide * 0.18],
        [half - 9, side * wide * 0.5],
        [half - 9, side * wide * 0.16],
        [half - 2, side * wide * 0.05],
      ], 0xf4fff9, spinning ? alpha * 0.35 : alpha);
      fill([
        [-half + 2, side * wide * 0.16],
        [-half + 8, side * wide * 0.48],
        [-half + 8, side * wide * 0.12],
        [-half + 2, side * wide * 0.04],
      ], 0xff3d8a);
      fill([
        [half * 0.16, side * (wide + 1.5)],
        [half * 0.16, side * (wide + 4.5)],
        [-2, side * (wide + 4.5)],
        [-2, side * (wide + 1.5)],
      ], 0xd7fff6, alpha * 0.85);
    }
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        const wx = half * 0.46 * sx;
        const wy = (wide + 5.5) * sy;
        fill([[wx + 7, wy + 3.4], [wx - 7, wy + 3.4], [wx - 7, wy - 3.4], [wx + 7, wy - 3.4]], 0x07080d);
        fill([[wx + 2.2, wy + 1.4], [wx - 2.2, wy + 1.4], [wx - 2.2, wy - 1.4], [wx + 2.2, wy - 1.4]], 0x9aa4b8, alpha * 0.9);
      }
    }
    if (shield) {
      g.lineStyle(2, 0x8eb6ff, alpha);
      g.strokeCircle(x, y, body.length * 0.55);
    }
  }
}

const CAR_BODY: Record<string, { length: number; width: number; nose: number }> = {
  volt: { length: 62, width: 24, nose: 18 },
  pixel: { length: 48, width: 28, nose: 8 },
  bulk: { length: 70, width: 34, nose: 12 },
  ghost: { length: 66, width: 20, nose: 22 },
};

function strokeLoop(g: Phaser.GameObjects.Graphics, track: Track, width: number, color: number, alpha: number) {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(track.points[0].x, track.points[0].y);
  for (const point of track.points.slice(1)) g.lineTo(point.x, point.y);
  g.closePath();
  g.strokePath();
}

function drawCity(g: Phaser.GameObjects.Graphics, track: Track, left: number, top: number, width: number, height: number) {
  const step = 118;
  g.lineStyle(10, 0x101628, 0.85);
  for (let x = left; x < left + width; x += step) {
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, top + height);
    g.strokePath();
  }
  for (let y = top; y < top + height; y += step) {
    g.beginPath();
    g.moveTo(left, y);
    g.lineTo(left + width, y);
    g.strokePath();
  }
  const keepOut = track.width * 0.5 + 78;
  for (let x = left; x < left + width; x += step) {
    for (let y = top; y < top + height; y += step) {
      const cx = x + step / 2;
      const cy = y + step / 2;
      if (roadDistance(track, cx, cy) < keepOut) continue;
      const n = hash(cx, cy);
      const floors = 3 + Math.floor(hash(cy, cx) * 7);
      const tower = n > 0.78;
      const bw = (tower ? 46 : 62) + n * 28;
      const bh = 28 + floors * 14 + (tower ? 36 : 0);
      const bx = cx - bw / 2;
      const by = cy - bh / 2;
      const neon = n > 0.66 ? 0xff3d8a : n > 0.33 ? 0x5cffd6 : 0xffc857;
      g.fillStyle(n > 0.5 ? 0x141b30 : 0x0c1222, 1);
      g.fillRect(bx, by, bw, bh);
      if (floors > 4) {
        g.fillStyle(0x1c2742, 1);
        g.fillRect(bx + 7, by - 16, bw - 14, 16);
      }
      g.lineStyle(2, neon, 0.75);
      g.strokeRect(bx, by, bw, bh);
      g.fillStyle(neon, 0.9);
      g.fillRect(bx, by, 3, bh);
      const win = n > 0.45 ? 0xc8fff4 : 0xffd0ea;
      const cols = Math.max(2, Math.floor(bw / 14));
      for (let row = 0; row < floors; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (hash(cx + row * 3, cy + col * 5) < 0.28) continue;
          g.fillStyle(win, 0.82);
          g.fillRect(bx + 8 + col * 12, by + 8 + row * 12, 6, 5);
        }
      }
      g.fillStyle(neon, 0.95);
      g.fillRect(bx + 6, by + 6, bw * 0.62, 5);
      if (tower) {
        g.lineStyle(2, neon, 0.9);
        g.beginPath();
        g.moveTo(cx, by - 16);
        g.lineTo(cx, by - 34);
        g.strokePath();
        g.fillStyle(0xfff1c9, 0.95);
        g.fillCircle(cx, by - 36, 2.4);
      }
    }
  }
}

function drawLamps(g: Phaser.GameObjects.Graphics, track: Track) {
  const off = track.width * 0.5 + 18;
  for (let along = 50; along < track.length; along += 170) {
    const pose = poseAt(track.points, track.length, along);
    const nx = -Math.sin(pose.angle);
    const ny = Math.cos(pose.angle);
    for (const side of [1, -1]) {
      const x = pose.x + nx * off * side;
      const y = pose.y + ny * off * side;
      g.fillStyle(0x242a3c, 1);
      g.fillRect(x - 1.4, y - 14, 2.8, 22);
      g.fillStyle(side > 0 ? 0x5cffd6 : 0xff3d8a, 0.95);
      g.fillCircle(x, y - 16, 3.2);
    }
  }
}

function roadDistance(track: Track, x: number, y: number) {
  let best = Infinity;
  const points = track.points;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    best = Math.min(best, pointSegment(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

function pointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hash(a: number, b: number) {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function lapLabel(lap: number) {
  return `Lap ${Math.min(LAPS, lap + 1)}/${LAPS}`;
}

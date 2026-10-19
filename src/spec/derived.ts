import type { Spec } from "./dimensions";

/** Axis-aligned box in millimetres, world coordinates. */
export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

export const box = (min: [number, number, number], max: [number, number, number]): Box => ({ min, max });

export const boxFromCenter = (c: readonly number[], size: readonly number[]): Box => ({
  min: [c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2],
  max: [c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2],
});

export const boxSize = (b: Box): [number, number, number] => [
  b.max[0] - b.min[0],
  b.max[1] - b.min[1],
  b.max[2] - b.min[2],
];

export const boxCenter = (b: Box): [number, number, number] => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];

export const unionBox = (...boxes: Box[]): Box => ({
  min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))) as [number, number, number],
  max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))) as [number, number, number],
});

/**
 * Values computed from the spec. Nothing here is a new measurement; it is all
 * arithmetic on spec entries so it stays consistent when the spec changes.
 */
export function derive(s: Spec) {
  const W = s.body.width.value;
  const H = s.body.height.value;
  const D = s.body.depth.value;
  const t = s.body.wallThickness.value;
  const floorY = s.feet.height.value;

  const body = box([-W / 2, floorY, -D / 2], [W / 2, floorY + H, D / 2]);
  const inner = box([-W / 2 + t, floorY + t, -D / 2 + t], [W / 2 - t, floorY + H - t, D / 2]);
  const opening = { minX: inner.min[0], maxX: inner.max[0], minY: inner.min[1], maxY: inner.max[1] };

  const g = s.door.gap.value;
  const front = D / 2;
  const doorBox = box(
    [opening.minX + g, opening.minY + g, front - s.door.depth.value],
    [opening.maxX - g, opening.maxY - g, front],
  );
  const doorBackZ = doorBox.min[2];

  const left = s.door.hingeSide === "left";
  const pivot = {
    x: left ? doorBox.min[0] + s.door.pivotInsetX.value : doorBox.max[0] - s.door.pivotInsetX.value,
    z: front - s.door.pivotInsetZ.value,
  };
  /** Sign of rotation.y that swings the door outward (+Z). */
  const openSign = left ? -1 : 1;

  const window = {
    minX: doorBox.min[0] + s.door.frameSide.value,
    maxX: doorBox.max[0] - s.door.frameSide.value,
    minY: doorBox.min[1] + s.door.frameBottom.value,
    maxY: doorBox.max[1] - s.door.frameTop.value,
  };
  const rb = s.door.glassRebate.value;
  const glassFrontZ = front - s.door.frontLipDepth.value;
  const glass = box(
    [window.minX - rb, window.minY - rb, glassFrontZ - s.door.glassThickness.value],
    [window.maxX + rb, window.maxY + rb, glassFrontZ],
  );

  const bayTop = inner.min[1] + s.electronicsBay.height.value;
  const coverTop = bayTop + s.electronicsBay.coverThickness.value;
  const bayFrontZ = s.electronicsBay.frontPanelZ.value;
  const bay = box([inner.min[0], inner.min[1], inner.min[2]], [inner.max[0], bayTop, bayFrontZ - s.electronicsBay.frontPanelThickness.value]);
  const bayCover = box([inner.min[0], bayTop, inner.min[2]], [inner.max[0], coverTop, bayFrontZ]);
  const bayFrontPanel = box(
    [inner.min[0], inner.min[1], bayFrontZ - s.electronicsBay.frontPanelThickness.value],
    [inner.max[0], bayTop, bayFrontZ],
  );
  const chamber = box([inner.min[0], coverTop, inner.min[2]], [inner.max[0], inner.max[1], doorBackZ]);

  const walls = {
    left: box([body.min[0], body.min[1], body.min[2]], [inner.min[0], body.max[1], body.max[2]]),
    right: box([inner.max[0], body.min[1], body.min[2]], [body.max[0], body.max[1], body.max[2]]),
    top: box([body.min[0], inner.max[1], body.min[2]], [body.max[0], body.max[1], body.max[2]]),
    bottom: box([body.min[0], body.min[1], body.min[2]], [body.max[0], inner.min[1], body.max[2]]),
    rear: box([body.min[0], body.min[1], body.min[2]], [body.max[0], body.max[1], inner.min[2]]),
  };

  return {
    W, H, D, t, floorY, front,
    body, inner, opening, doorBox, doorBackZ, pivot, openSign, window, glass, glassFrontZ,
    bay, bayTop, coverTop, bayCover, bayFrontPanel, chamber, walls,
  };
}

export type Derived = ReturnType<typeof derive>;

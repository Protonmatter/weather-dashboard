export interface ContourPoint {
  x: number;
  y: number;
}

export interface ContourSegment {
  level: number;
  a: ContourPoint;
  b: ContourPoint;
}

type EdgeName = "top" | "right" | "bottom" | "left";

const interpolate = (a: number, b: number, level: number): number => {
  if (a === b) return 0.5;
  return Math.min(1, Math.max(0, (level - a) / (b - a)));
};

function edgePoint(
  edge: EdgeName,
  values: readonly [number, number, number, number],
  level: number,
  col: number,
  row: number,
  cellWidth: number,
  cellHeight: number
): ContourPoint {
  const [topLeft, topRight, bottomRight, bottomLeft] = values;
  switch (edge) {
    case "top":
      return { x: (col + interpolate(topLeft, topRight, level)) * cellWidth, y: row * cellHeight };
    case "right":
      return { x: (col + 1) * cellWidth, y: (row + interpolate(topRight, bottomRight, level)) * cellHeight };
    case "bottom":
      return { x: (col + interpolate(bottomLeft, bottomRight, level)) * cellWidth, y: (row + 1) * cellHeight };
    case "left":
      return { x: col * cellWidth, y: (row + interpolate(topLeft, bottomLeft, level)) * cellHeight };
  }
}

const CASES: Readonly<Record<number, ReadonlyArray<readonly [EdgeName, EdgeName]>>> = {
  1: [["left", "top"]],
  2: [["top", "right"]],
  3: [["left", "right"]],
  4: [["right", "bottom"]],
  6: [["top", "bottom"]],
  7: [["left", "bottom"]],
  8: [["bottom", "left"]],
  9: [["top", "bottom"]],
  11: [["right", "bottom"]],
  12: [["left", "right"]],
  13: [["top", "right"]],
  14: [["left", "top"]],
};

function pairsForCase(index: number, centerHigh: boolean): ReadonlyArray<readonly [EdgeName, EdgeName]> {
  if (index === 5) {
    return centerHigh
      ? [["top", "right"], ["bottom", "left"]]
      : [["top", "left"], ["right", "bottom"]];
  }
  if (index === 10) {
    return centerHigh
      ? [["top", "left"], ["right", "bottom"]]
      : [["top", "right"], ["bottom", "left"]];
  }
  return CASES[index] ?? [];
}

export function contourSegments(
  values: readonly (number | null)[],
  rows: number,
  cols: number,
  level: number,
  width: number,
  height: number
): ContourSegment[] {
  if (rows < 2 || cols < 2 || values.length !== rows * cols) return [];
  const cellWidth = width / (cols - 1);
  const cellHeight = height / (rows - 1);
  const segments: ContourSegment[] = [];

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const raw = [
        values[row * cols + col],
        values[row * cols + col + 1],
        values[(row + 1) * cols + col + 1],
        values[(row + 1) * cols + col],
      ] as const;
      if (raw.some((v) => v == null || !Number.isFinite(v))) continue;
      const cell = raw as readonly [number, number, number, number];
      const index =
        (cell[0] >= level ? 1 : 0) |
        (cell[1] >= level ? 2 : 0) |
        (cell[2] >= level ? 4 : 0) |
        (cell[3] >= level ? 8 : 0);
      if (index === 0 || index === 15) continue;
      const center = (cell[0] + cell[1] + cell[2] + cell[3]) / 4;
      for (const [first, second] of pairsForCase(index, center >= level)) {
        segments.push({
          level,
          a: edgePoint(first, cell, level, col, row, cellWidth, cellHeight),
          b: edgePoint(second, cell, level, col, row, cellWidth, cellHeight),
        });
      }
    }
  }
  return segments;
}

export function contourLevels(
  values: readonly (number | null)[],
  interval = 4
): number[] {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!finite.length || !Number.isFinite(interval) || interval <= 0) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const first = Math.ceil(min / interval) * interval;
  const last = Math.floor(max / interval) * interval;
  const levels: number[] = [];
  for (let level = first; level <= last; level += interval) levels.push(level);
  return levels;
}

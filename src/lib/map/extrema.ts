export interface PressureExtremum {
  kind: "H" | "L";
  value: number;
  row: number;
  col: number;
  x: number;
  y: number;
  prominence: number;
}

const WEIGHTS = [1, 2, 1, 2, 4, 2, 1, 2, 1] as const;

export function smoothGrid(
  values: readonly (number | null)[],
  rows: number,
  cols: number
): Array<number | null> {
  if (values.length !== rows * cols) return [];
  const smoothed: Array<number | null> = new Array(values.length).fill(null);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum = 0;
      let totalWeight = 0;
      let weightIndex = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++, weightIndex++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
          const value = values[r * cols + c];
          if (value == null || !Number.isFinite(value)) continue;
          const weight = WEIGHTS[weightIndex]!;
          sum += value * weight;
          totalWeight += weight;
        }
      }
      smoothed[row * cols + col] = totalWeight ? sum / totalWeight : null;
    }
  }
  return smoothed;
}

export function findPressureExtrema(
  values: readonly (number | null)[],
  rows: number,
  cols: number,
  width: number,
  height: number,
  minProminence = 0.7,
  minDistance = 96
): PressureExtremum[] {
  if (rows < 3 || cols < 3 || values.length !== rows * cols) return [];
  const smooth = smoothGrid(values, rows, cols);
  const candidates: PressureExtremum[] = [];

  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const value = smooth[row * cols + col];
      if (value == null) continue;
      const neighbours: number[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const neighbour = smooth[(row + dr) * cols + col + dc];
          if (neighbour != null) neighbours.push(neighbour);
        }
      }
      if (neighbours.length !== 8) continue;
      const high = neighbours.every((n) => value > n);
      const low = neighbours.every((n) => value < n);
      if (!high && !low) continue;
      const mean = neighbours.reduce((sum, n) => sum + n, 0) / neighbours.length;
      const prominence = Math.abs(value - mean);
      if (prominence < minProminence) continue;
      candidates.push({
        kind: high ? "H" : "L",
        value,
        row,
        col,
        x: (col / (cols - 1)) * width,
        y: (row / (rows - 1)) * height,
        prominence,
      });
    }
  }

  const selected: PressureExtremum[] = [];
  for (const candidate of candidates.sort((a, b) => b.prominence - a.prominence)) {
    const tooClose = selected.some(
      (other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < minDistance
    );
    if (!tooClose) selected.push(candidate);
  }
  return selected;
}

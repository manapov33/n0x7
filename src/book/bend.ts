const STEPS = 24;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Point at distance u (0..1 along the sheet from the spine) for turn progress p (0..1).
export function sheetPoint(u: number, p: number): { x: number; z: number } {
  const angle = (s: number) =>
    clamp(Math.PI * p + 0.6 * Math.sin(Math.PI * p) * (s - 0.5), 0, Math.PI);
  const h = u / STEPS;
  let x = 0;
  let z = 0;
  for (let i = 0; i < STEPS; i++) {
    const a = angle((i + 0.5) * h);
    x += Math.cos(a) * h;
    z += Math.sin(a) * h;
  }
  return { x, z };
}

export function shadowOpacity(p: number): number {
  return 0.45 * Math.sin(Math.PI * p);
}

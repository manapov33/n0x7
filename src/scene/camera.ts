const MARGIN = 1.16; // 8% запаса с каждого края

export function fitCamera(
  aspect: number,
  target: 'spread' | 'page',
  pageW: number,
  pageH: number,
  fovDeg: number,
): number {
  const halfTan = Math.tan((fovDeg * Math.PI) / 360);
  const needW = (target === 'spread' ? 2 * pageW : pageW) * MARGIN;
  const needH = pageH * MARGIN;
  const byHeight = needH / 2 / halfTan;
  const byWidth = needW / 2 / (halfTan * aspect);
  return Math.max(byHeight, byWidth);
}

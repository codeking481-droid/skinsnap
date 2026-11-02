export const MAX_CONTENT_WIDTH = 520;
export const DESIGN_WIDTH = 393;

export function responsiveScale(width: number): number {
  return Math.max(0.78, Math.min(Math.min(width, MAX_CONTENT_WIDTH) / DESIGN_WIDTH, 1.08));
}

export function contentWidth(width: number, horizontalPadding = 0): number {
  return Math.max(0, Math.min(width, MAX_CONTENT_WIDTH) - horizontalPadding * 2);
}

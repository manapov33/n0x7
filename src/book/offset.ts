/** Закрытый журнал (обложка справа от корешка) сдвигается влево, чтобы обложка была по центру. */
export function bookOffsetX(coverProgress: number, pageW: number): number {
  return (-pageW / 2) * (1 - Math.min(1, Math.max(0, coverProgress)));
}

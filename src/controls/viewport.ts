export const PHONE_MAX_WIDTH = 768;

/** Телефон — ширина экрана меньше 768 px. */
export const isPhone = (viewportWidth: number): boolean => viewportWidth < PHONE_MAX_WIDTH;

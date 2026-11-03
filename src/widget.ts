/**
 * The contract every widget implements. `index.ts` in a widget folder must
 * `export const mount: Mount`. Return a cleanup function if the widget holds
 * resources (animation frames, listeners, framework apps).
 */
export type Mount = (el: HTMLElement) => void | (() => void);

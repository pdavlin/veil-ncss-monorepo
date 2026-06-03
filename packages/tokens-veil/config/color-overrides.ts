/**
 * Manual color overrides for Veil brand colors the client has marked immutable.
 *
 * - Colors listed in `lockedBackgrounds` will never be adjusted; the resolver shifts
 *   the foreground instead.
 * - Colors in `lockedForegrounds` are treated symmetrically.
 * - Colors locked on both sides surface in `color-decisions.md` as `manual-override`
 *   and fail the build until the engineer addresses them.
 */
export const overrides = {
  lockedBackgrounds: [
    '#0b0b0b',
    '#ffffff',
  ],
  lockedForegrounds: [
    '#0000ee',
  ],
};

import { describe, it, expect } from 'vitest';
import { buildFluidType } from './utopia.js';

describe('buildFluidType', () => {
  it('returns step-0 hitting the configured min font-size at minWidth', () => {
    const scale = buildFluidType({
      minWidth: 320,
      maxWidth: 1440,
      minFontSize: 16,
      maxFontSize: 19,
      minTypeScale: 1.2,
      maxTypeScale: 1.333,
      positiveSteps: 3,
      negativeSteps: 1,
    });
    expect(scale['step-0']).toBeDefined();
    expect(scale['step-0']?.min).toBe('16px');
    expect(scale['step-0']?.max).toBe('19px');
    expect(scale['step-0']?.clamp).toMatch(/^clamp\(/);
  });

  it('produces the configured number of steps', () => {
    const scale = buildFluidType({
      minWidth: 320,
      maxWidth: 1440,
      minFontSize: 16,
      maxFontSize: 19,
      minTypeScale: 1.2,
      maxTypeScale: 1.333,
      positiveSteps: 5,
      negativeSteps: 2,
    });
    expect(Object.keys(scale).length).toBe(5 + 2 + 1);
  });
});

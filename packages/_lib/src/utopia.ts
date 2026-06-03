import { calculateTypeScale, calculateSpaceScale } from 'utopia-core';

export interface FluidValue {
  step: string;
  min: string;
  max: string;
  clamp: string;
  minVw: number;
  maxVw: number;
}

export interface FluidTypeConfig {
  minWidth: number;
  maxWidth: number;
  minFontSize: number;
  maxFontSize: number;
  minTypeScale: number;
  maxTypeScale: number;
  positiveSteps: number;
  negativeSteps: number;
}

export interface FluidSpaceConfig {
  minWidth: number;
  maxWidth: number;
  minSize: number;
  maxSize: number;
  positiveSteps: number[];
  negativeSteps: number[];
}

function typeStepLabel(step: number): string {
  if (step === 0) return 'step-0';
  if (step > 0) return `step-${step}`;
  return `step--${Math.abs(step)}`;
}

export function buildFluidType(config: FluidTypeConfig): Record<string, FluidValue> {
  const steps = calculateTypeScale(config);
  const out: Record<string, FluidValue> = {};
  for (const s of steps) {
    const label = typeStepLabel(s.step);
    out[label] = {
      step: label,
      min: `${s.minFontSize}px`,
      max: `${s.maxFontSize}px`,
      clamp: s.clamp,
      minVw: config.minWidth,
      maxVw: config.maxWidth,
    };
  }
  return out;
}

export function buildFluidSpace(config: FluidSpaceConfig): Record<string, FluidValue> {
  const scale = calculateSpaceScale(config);
  const out: Record<string, FluidValue> = {};
  for (const size of scale.sizes) {
    out[size.label] = {
      step: size.label,
      min: `${size.minSize}px`,
      max: `${size.maxSize}px`,
      clamp: size.clamp,
      minVw: config.minWidth,
      maxVw: config.maxWidth,
    };
  }
  return out;
}

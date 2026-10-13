import { describe, expect, it } from 'vitest';
import { estimateMaintenanceKcal, macrosFromKcal, progress } from './goals';

describe('goals', () => {
  it('Mifflin-St Jeor × activity, rounded to 10 kcal', () => {
    // 10*70 + 6.25*175 - 5*30 + 5 = 1648.75; ×1.55 = 2555.6 -> 2560
    expect(estimateMaintenanceKcal({ sex: 'male', ageYears: 30, heightCm: 175, weightKg: 70, activity: 'moderate' })).toBe(2560);
    // 10*60 + 6.25*162 - 5*25 - 161 = 1326.5; ×1.2 = 1591.8 -> 1590
    expect(estimateMaintenanceKcal({ sex: 'female', ageYears: 25, heightCm: 162, weightKg: 60, activity: 'sedentary' })).toBe(1590);
  });
  it('refuses minors and implausible input', () => {
    expect(() => estimateMaintenanceKcal({ sex: 'male', ageYears: 16, heightCm: 170, weightKg: 60, activity: 'light' })).toThrow();
    expect(() => estimateMaintenanceKcal({ sex: 'male', ageYears: 30, heightCm: 17, weightKg: 60, activity: 'light' })).toThrow();
  });
  it('splits calories into grams', () => {
    expect(macrosFromKcal(2000)).toEqual({ protein_g: 100, carb_g: 250, fat_g: 67 });
  });
  it('progress is neutral above the reference', () => {
    expect(progress(500, 2000)).toEqual({ fraction: 0.25, left: 1500, over: null });
    expect(progress(2300, 2000)).toEqual({ fraction: 1, left: null, over: 300 });
    expect(progress(100, null)).toEqual({ fraction: 0, left: null, over: null });
  });
});

import type { HoldData, HoldType, LocationId, RouteData } from '../core/contracts';

export const HOLD_METADATA: Record<HoldType, { label: string; gripDifficulty: number; hand: boolean; foot: boolean; staminaModifier: number }> = {
  jug: { label: 'Jug', gripDifficulty: 0.15, hand: true, foot: true, staminaModifier: 0.6 },
  crimp: { label: 'Crimp', gripDifficulty: 0.7, hand: true, foot: true, staminaModifier: 1.4 },
  sloper: { label: 'Sloper', gripDifficulty: 0.65, hand: true, foot: false, staminaModifier: 1.2 },
  pinch: { label: 'Pinch', gripDifficulty: 0.45, hand: true, foot: true, staminaModifier: 1 },
  foothold: { label: 'Foot chip', gripDifficulty: 1, hand: false, foot: true, staminaModifier: 0.8 },
};

/** Curated routes share precisely the same schema and climbing path as user routes. */
export function createDefaultRoute(location: LocationId): RouteData {
  const outdoor = location === 'outdoor';
  const wallId = `${location}-main`;
  const routeColor = outdoor ? '#e3ae55' : '#de806a';
  const holds: HoldData[] = [];
  const add = (x: number, y: number, type: HoldType, start = false, finish = false): void => {
    const index = holds.length;
    holds.push({
      id: `${location}-hold-${index}`, type, asset: `hold-${type}`, position: [x, y, 0.12],
      rotation: (index % 5 - 2) * 0.16, scale: type === 'foothold' ? 0.8 : 1,
      color: routeColor, start, finish, wallId,
    });
  };
  add(-0.35, 1.35, 'jug', true);
  add(0.35, 1.35, 'jug', true);
  add(-0.38, 0.3, 'foothold');
  add(0.35, 0.44, 'foothold');
  const rows = outdoor ? 37 : 10;
  for (let row = 1; row <= rows; row++) {
    const y = 1.35 + row * 0.55;
    const side = row % 2 === 0 ? -1 : 1;
    const x = side * (0.31 + Math.sin(row * 0.8) * 0.06);
    const type: HoldType = row === rows || row % 4 === 0 ? 'jug' : row % 3 === 0 ? 'pinch' : 'jug';
    add(x, y, type, false, row === rows);
    add(-side * (0.25 + Math.cos(row * 0.67) * 0.18), y - 0.86, 'foothold');
  }
  return {
    version: 1, id: `${location}-welcome-route`, name: outdoor ? 'The Long Hello' : 'A Little Higher',
    creator: 'Juniper climbing club', color: routeColor, holds, wallId,
    grade: outdoor ? '5.7 · friendly lead' : 'V0 · warm up', createdAt: '2026-09-22T12:00:00.000Z',
  };
}

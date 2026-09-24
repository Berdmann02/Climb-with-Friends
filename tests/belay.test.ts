import { describe, expect, it } from 'vitest';
import { BelayController } from '../src/belay/BelayController';

function step(belay: BelayController, seconds: number, height = 8): void {
  for (let time = 0; time < seconds; time += 1 / 60) belay.update(1 / 60, belay.fallHeight ?? height);
}

describe('belay state transitions', () => {
  it('feeds and takes bounded slack, with explicit brake lock', () => {
    const belay = new BelayController();
    belay.setAction('feed'); step(belay, 2);
    expect(belay.slack).toBeGreaterThan(1.5);
    expect(belay.state).toBe('feeding');
    belay.setAction('take'); step(belay, 5);
    expect(belay.slack).toBeCloseTo(0.08);
    expect(belay.state).toBe('taking');
    belay.setAction('lock'); step(belay, 1);
    expect(belay.state).toBe('locked');
    expect(belay.tension).toBeGreaterThan(0.8);
  });

  it('first falls through slack, then catches above the ground', () => {
    const belay = new BelayController();
    belay.beginFall(8, 6);
    step(belay, 0.1);
    expect(belay.state).toBe('falling');
    expect(belay.fallHeight).toBeLessThan(8);
    expect(belay.caught).toBe(false);
    step(belay, 3);
    expect(belay.state).toBe('caught');
    expect(belay.caught).toBe(true);
    expect(belay.fallHeight).toBeGreaterThan(belay.minimumHeight);
    expect(belay.fallHeight).toBeLessThan(6);
    expect(belay.tension).toBeGreaterThan(0.7);
  });

  it('brake lock reduces the final fall distance', () => {
    const neutral = new BelayController(), locked = new BelayController();
    neutral.beginFall(8, 6); locked.beginFall(8, 6); locked.setAction('lock');
    step(neutral, 5); step(locked, 5);
    expect(locked.fallHeight!).toBeGreaterThan(neutral.fallHeight! + 0.2);
  });

  it('lowers smoothly and can reset for the next attempt', () => {
    const belay = new BelayController();
    belay.beginFall(8, 6); step(belay, 3);
    const caughtHeight = belay.fallHeight!;
    belay.setAction('lower'); step(belay, 1);
    expect(belay.state).toBe('lowering');
    expect(belay.fallHeight).toBeCloseTo(caughtHeight - 0.9, 1);
    step(belay, 20);
    expect(belay.fallHeight).toBe(belay.minimumHeight);
    expect(belay.caught).toBe(false);
    belay.reset();
    expect(belay.fallHeight).toBeNull();
    expect(belay.state).toBe('ready');
    expect(belay.slack).toBe(0.55);
  });

  it('consumes available slack when the climber rises and ignores invalid time', () => {
    const belay = new BelayController();
    belay.update(0.016, 2); const slack = belay.slack;
    belay.update(0.016, 2.2);
    expect(belay.slack).toBeLessThan(slack);
    belay.update(NaN, 2);
    expect(Number.isFinite(belay.slack)).toBe(true);
  });

  it('brakes partway through lowering without returning to the original catch height', () => {
    const belay = new BelayController();
    belay.beginFall(12, 10); step(belay, 3);
    belay.setAction('lower'); step(belay, 2);
    const height = belay.fallHeight!;
    belay.setAction('lock'); step(belay, 1);
    expect(Math.abs(belay.fallHeight! - height)).toBeLessThan(.15);
    belay.setAction('lower'); step(belay, 1);
    expect(belay.fallHeight).toBeLessThan(height - .7);
  });

  it('honors a lower requested while the rope is catching the fall', () => {
    const belay = new BelayController();
    belay.beginFall(8, 6); belay.setAction('lower'); step(belay, 3);
    expect(belay.state).toBe('lowering');
  });
});

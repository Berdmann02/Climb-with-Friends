export type BelayAction = 'neutral' | 'feed' | 'take' | 'lock' | 'lower';
export type BelayState = 'ready' | 'feeding' | 'taking' | 'locked' | 'falling' | 'caught' | 'lowering';

/** Deliberately forgiving game rules, not a model of real-world belay technique. */
export class BelayController {
  private currentAction: BelayAction = 'neutral';
  private currentState: BelayState = 'ready';
  private extraSlack = 0.55;
  private ropeTension = 0;
  private height: number | null = null;
  private previousClimberHeight: number | null = null;
  private velocity = 0;
  private catchTarget = 0;
  private catchTime = 0;
  private hasCaught = false;
  private lockApplied = false;
  readonly minimumHeight = 0.85;

  get slack(): number { return this.extraSlack; }
  get tension(): number { return this.ropeTension; }
  get state(): BelayState { return this.currentState; }
  get action(): BelayAction { return this.currentAction; }
  get fallHeight(): number | null { return this.height; }
  get caught(): boolean { return this.hasCaught; }

  setAction(action: BelayAction): void { this.currentAction = action; }

  beginFall(height: number, lastClipHeight: number): void {
    if (!Number.isFinite(height) || !Number.isFinite(lastClipHeight)) return;
    this.height = Math.max(this.minimumHeight, height);
    const aboveProtection = Math.max(0, height - lastClipHeight);
    // A forgiving ground clamp keeps the prototype catch controlled and readable.
    this.catchTarget = Math.max(this.minimumHeight, Math.min(height - 0.25, lastClipHeight - aboveProtection - this.extraSlack - 0.2));
    this.velocity = 0;
    this.catchTime = 0;
    this.hasCaught = false;
    this.lockApplied = false;
    this.currentState = 'falling';
  }

  resumeClimbing(): void {
    this.height = null; this.velocity = 0; this.hasCaught = false;
    this.previousClimberHeight = null; this.currentAction = 'neutral'; this.currentState = 'ready';
  }

  reset(): void { this.resumeClimbing(); this.extraSlack = 0.55; this.ropeTension = 0; }

  update(dt: number, climberHeight: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(climberHeight)) return;
    dt = Math.min(dt, 0.1);
    if (this.currentState === 'falling' && this.height !== null) {
      if (this.currentAction === 'lock' && !this.lockApplied) {
        this.catchTarget = Math.min(this.height - 0.05, this.catchTarget + 0.3);
        this.extraSlack = Math.max(0.08, this.extraSlack - 0.2);
        this.lockApplied = true;
      }
      this.velocity = Math.min(9, this.velocity + 9.81 * dt);
      this.height -= this.velocity * dt;
      this.ropeTension += (0.12 - this.ropeTension) * Math.min(1, dt * 12);
      if (this.height <= this.catchTarget) {
        this.height = this.catchTarget; this.velocity = 0; this.hasCaught = true;
        this.currentState = 'caught'; this.currentAction = 'lock'; this.ropeTension = 1;
      }
      this.previousClimberHeight = climberHeight;
      return;
    }
    if (this.currentAction === 'lower') {
      if (this.height === null) this.height = Math.max(this.minimumHeight, climberHeight);
      this.currentState = 'lowering';
      this.height = Math.max(this.minimumHeight, this.height - dt * 0.9);
      this.ropeTension += (0.72 - this.ropeTension) * Math.min(1, dt * 5);
      this.extraSlack = Math.max(0.12, this.extraSlack - dt * 0.8);
      if (this.height <= this.minimumHeight) { this.currentState = 'ready'; this.hasCaught = false; }
    } else if (this.hasCaught && this.height !== null) {
      this.catchTime += dt;
      this.height = Math.max(this.minimumHeight, this.catchTarget + Math.sin(this.catchTime * 6) * 0.13 * Math.exp(-this.catchTime * 2.2));
      this.currentState = 'caught';
      this.ropeTension += (0.78 - this.ropeTension) * Math.min(1, dt * 3);
    } else {
      // Rope paid out to upward movement is deducted from the available loop.
      if (this.previousClimberHeight !== null) this.extraSlack -= Math.max(0, climberHeight - this.previousClimberHeight) * 0.7;
      if (this.currentAction === 'feed') { this.extraSlack += dt * 0.85; this.currentState = 'feeding'; }
      else if (this.currentAction === 'take') { this.extraSlack -= dt * 1.05; this.currentState = 'taking'; }
      else if (this.currentAction === 'lock') this.currentState = 'locked';
      else this.currentState = 'ready';
      this.extraSlack = Math.max(0.08, Math.min(2.8, this.extraSlack));
      const target = this.currentAction === 'lock' ? 0.85 : Math.max(0.05, 0.35 - this.extraSlack * 0.25);
      this.ropeTension += (target - this.ropeTension) * Math.min(1, dt * 6);
    }
    this.previousClimberHeight = climberHeight;
  }
}

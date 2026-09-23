export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitStats {
  service: string;
  state: CircuitState;
  failures: number;
  openedAt: number | null;
  cooldownUntil: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt: number | null = null;
  private cooldownUntil: number | null = null;

  constructor(
    private readonly service: string,
    private readonly failureThreshold: number,
    private readonly resetTimeoutMs: number
  ) {}

  isOpen(): boolean {
    if (this.state === 'open' && this.cooldownUntil && Date.now() >= this.cooldownUntil) {
      this.state = 'half-open';
      return false;
    }

    return this.state === 'open';
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = null;
    this.cooldownUntil = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
      this.cooldownUntil = Date.now() + this.resetTimeoutMs;
    }
  }

  getStats(): CircuitStats {
    return {
      service: this.service,
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt,
      cooldownUntil: this.cooldownUntil,
    };
  }
}

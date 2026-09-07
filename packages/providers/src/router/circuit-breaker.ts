import type { CircuitBreakerConfig } from "@velocity/contracts";

/**
 * Per-provider circuit breaker (ADR 0004). `closed` = normal routing.
 * `open` = the provider is dropped from selection entirely until the
 * cooldown elapses. `half_open` = one trial candidate is allowed back in,
 * ranked below every closed candidate, so a recovering provider gets
 * traffic again without immediately absorbing the full load.
 */
export type BreakerState = "closed" | "open" | "half_open";

interface BreakerRecord {
  state: BreakerState;
  failures: { at: number }[];
  openedAt: number | null;
}

export interface BreakerStore {
  get(providerId: string): BreakerRecord | undefined;
  set(providerId: string, record: BreakerRecord): void;
}

export class InMemoryBreakerStore implements BreakerStore {
  private readonly records = new Map<string, BreakerRecord>();

  get(providerId: string): BreakerRecord | undefined {
    return this.records.get(providerId);
  }

  set(providerId: string, record: BreakerRecord): void {
    this.records.set(providerId, record);
  }
}

export class CircuitBreaker {
  constructor(
    private readonly store: BreakerStore = new InMemoryBreakerStore(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  state(providerId: string, config: CircuitBreakerConfig): BreakerState {
    const record = this.store.get(providerId);
    if (!record) return "closed";

    if (record.state === "open" && record.openedAt !== null) {
      const cooldownElapsedMs = this.now() - record.openedAt;
      if (cooldownElapsedMs >= config.cooldownSec * 1000) {
        const halfOpen: BreakerRecord = { state: "half_open", failures: record.failures, openedAt: record.openedAt };
        this.store.set(providerId, halfOpen);
        return "half_open";
      }
    }
    return record.state;
  }

  recordSuccess(providerId: string): void {
    this.store.set(providerId, { state: "closed", failures: [], openedAt: null });
  }

  recordFailure(providerId: string, config: CircuitBreakerConfig): void {
    const existing = this.store.get(providerId) ?? { state: "closed" as BreakerState, failures: [], openedAt: null };
    const cutoff = this.now() - config.windowSec * 1000;
    const recentFailures = [...existing.failures.filter((f) => f.at >= cutoff), { at: this.now() }];

    if (existing.state === "half_open") {
      // A failure while on trial re-opens immediately — no need to re-accumulate the full threshold.
      this.store.set(providerId, { state: "open", failures: recentFailures, openedAt: this.now() });
      return;
    }

    if (recentFailures.length >= config.failureThreshold) {
      this.store.set(providerId, { state: "open", failures: recentFailures, openedAt: this.now() });
      return;
    }

    this.store.set(providerId, { state: "closed", failures: recentFailures, openedAt: null });
  }
}

import { describe, expect, it } from "vitest";
import { CircuitBreaker, InMemoryBreakerStore } from "../router/circuit-breaker.js";

const CONFIG = { failureThreshold: 3, windowSec: 60, cooldownSec: 30 };

describe("CircuitBreaker", () => {
  it("stays closed for a provider with no recorded failures", () => {
    const breaker = new CircuitBreaker(new InMemoryBreakerStore());
    expect(breaker.state("p1", CONFIG)).toBe("closed");
  });

  it("opens after reaching the failure threshold within the window", () => {
    const breaker = new CircuitBreaker(new InMemoryBreakerStore());
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    expect(breaker.state("p1", CONFIG)).toBe("closed");
    breaker.recordFailure("p1", CONFIG);
    expect(breaker.state("p1", CONFIG)).toBe("open");
  });

  it("does not open when failures are below threshold", () => {
    const breaker = new CircuitBreaker(new InMemoryBreakerStore());
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    expect(breaker.state("p1", CONFIG)).toBe("closed");
  });

  it("a success resets the failure count", () => {
    const breaker = new CircuitBreaker(new InMemoryBreakerStore());
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    breaker.recordSuccess("p1");
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    expect(breaker.state("p1", CONFIG)).toBe("closed");
  });

  it("transitions open -> half_open once the cooldown elapses", () => {
    let now = 0;
    const breaker = new CircuitBreaker(new InMemoryBreakerStore(), () => now);
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    expect(breaker.state("p1", CONFIG)).toBe("open");

    now += (CONFIG.cooldownSec - 1) * 1000;
    expect(breaker.state("p1", CONFIG)).toBe("open");

    now += 2000; // now past cooldownSec total
    expect(breaker.state("p1", CONFIG)).toBe("half_open");
  });

  it("a failure while half_open re-opens immediately, not after another full threshold", () => {
    let now = 0;
    const breaker = new CircuitBreaker(new InMemoryBreakerStore(), () => now);
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    now += CONFIG.cooldownSec * 1000 + 1000;
    expect(breaker.state("p1", CONFIG)).toBe("half_open");

    breaker.recordFailure("p1", CONFIG);
    expect(breaker.state("p1", CONFIG)).toBe("open");
  });

  it("failures outside the window do not count toward the threshold", () => {
    let now = 0;
    const breaker = new CircuitBreaker(new InMemoryBreakerStore(), () => now);
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    now += (CONFIG.windowSec + 1) * 1000;
    breaker.recordFailure("p1", CONFIG);
    // The first two failures have aged out of the 60s window, so this is
    // only the 1st failure within the current window — should stay closed.
    expect(breaker.state("p1", CONFIG)).toBe("closed");
  });

  it("breakers for different providers are independent", () => {
    const breaker = new CircuitBreaker(new InMemoryBreakerStore());
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    breaker.recordFailure("p1", CONFIG);
    expect(breaker.state("p1", CONFIG)).toBe("open");
    expect(breaker.state("p2", CONFIG)).toBe("closed");
  });
});

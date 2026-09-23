type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  count: number;
};

function simulateTokenBucket(limit: number, refillRate: number, burst: number, hits: Array<number>): RateLimitResult {
  let tokens = burst;
  let lastRefill = hits[0] ?? 0;
  let count = 0;

  for (const now of hits) {
    const elapsed = Math.max(0, now - lastRefill);
    tokens = Math.min(burst, tokens + (elapsed / 1000) * refillRate);
    lastRefill = now;

    if (tokens >= 1) {
      tokens -= 1;
      count += 1;
    }
  }

  return {
    allowed: count >= hits.length,
    remaining: Math.max(0, Math.floor(tokens)),
    count,
  };
}

function simulateFixedWindow(limit: number, windowMs: number, hits: Array<number>): RateLimitResult {
  const counts = new Map<number, number>();
  let count = 0;

  for (const now of hits) {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const current = counts.get(windowStart) ?? 0;
    if (current < limit) {
      counts.set(windowStart, current + 1);
      count += 1;
    }
  }

  return {
    allowed: count === hits.length,
    remaining: Math.max(0, limit - (counts.get(Math.floor(hits[hits.length - 1] / windowMs) * windowMs) ?? 0)),
    count,
  };
}

function simulateSlidingWindowLog(limit: number, windowMs: number, hits: Array<number>): RateLimitResult {
  const events: number[] = [];
  let count = 0;

  for (const now of hits) {
    const windowStart = now - windowMs;
    while (events.length > 0 && events[0] < windowStart) {
      events.shift();
    }
    if (events.length < limit) {
      events.push(now);
      count += 1;
    }
  }

  return {
    allowed: count === hits.length,
    remaining: Math.max(0, limit - events.length),
    count,
  };
}

function simulateSlidingWindowCounter(limit: number, windowMs: number, hits: Array<number>): RateLimitResult {
  let currentCount = 0;
  let previousCount = 0;
  let currentWindow = Math.floor(hits[0] / windowMs) * windowMs;
  let count = 0;

  for (const now of hits) {
    const window = Math.floor(now / windowMs) * windowMs;
    if (window !== currentWindow) {
      previousCount = currentCount;
      currentCount = 0;
      currentWindow = window;
    }

    const currentWindowAge = now - currentWindow;
    const ratio = currentWindowAge / windowMs;
    const estimated = currentCount + (previousCount * (1 - ratio));
    if (estimated < limit) {
      currentCount += 1;
      count += 1;
    }
  }

  return {
    allowed: count === hits.length,
    remaining: Math.max(0, Math.floor(limit - currentCount)),
    count,
  };
}

describe('rate limiting algorithms', () => {
  it('token bucket allows a burst up to the configured bucket size before forcing refill', () => {
    const result = simulateTokenBucket(5, 2, 5, [0, 0, 0, 0, 0, 0, 500, 1500]);

    expect(result.count).toBe(7);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('fixed window has a boundary burst flaw: the reset occurs all at once', () => {
    const atBoundary = [59_000, 59_500, 60_000, 60_100];
    const result = simulateFixedWindow(2, 60_000, atBoundary);

    expect(result.count).toBe(4);
    expect(result.allowed).toBe(true);
  });

  it('sliding window log remains precise around the exact boundary', () => {
    const result = simulateSlidingWindowLog(3, 60_000, [0, 10, 20, 59_500, 60_000, 60_100]);

    expect(result.count).toBe(4);
    expect(result.remaining).toBe(2);
  });

  it('sliding window counter approximates a moving window while staying cheap', () => {
    const result = simulateSlidingWindowCounter(4, 60_000, [0, 10, 20, 30, 45, 70]);

    expect(result.count).toBeGreaterThanOrEqual(4);
    expect(result.count).toBeLessThanOrEqual(6);
  });
});

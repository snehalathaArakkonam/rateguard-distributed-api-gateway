# Architecture deep dive

## 1. Why Lua scripts prevent race conditions

The central problem in a horizontally scaled API gateway is not just rate-limit enforcement but enforcing it without duplication under concurrency. If each instance of the gateway does a read-modify-write sequence independently, multiple requests from the same client can race with one another.

A naive pattern looks like this:

```js
const count = await redis.get(key);
if (Number(count) < limit) {
  await redis.set(key, Number(count) + 1);
}
```

When two requests hit simultaneously on different gateway nodes, both requests can read the same count and both decide the request is allowed. The result is over-counting and the limit is bypassed. This is a classic race condition.

Redis Lua scripts solve this because Redis executes the entire script as one atomic operation on the Redis server itself. There is no interleaving with another script in the middle of the read-modify-write sequence. Since the gateway still performs a single network round trip, the script remains efficient and safe under high concurrency.

In RateGuard, each algorithm implements the increment-and-check inside a Lua script so the enforcement logic is truly shared across all gateway replicas. Each script returns the allowed decision and the updated remaining or reset metadata in a single call.

## 2. CAP trade-off and the design choice here

This system intentionally favors availability and partition tolerance over strict global consistency for the rate-limit state, which is a realistic choice for an edge gateway.

The rate-limit state is held in Redis, which is a shared mutable state store. That gives us:

- very low latency
- single-round-trip enforcement
- shared state across instances

The trade-off is that Redis is not a fully consistent distributed database across geographic regions or multiple sharded clusters. If a Redis node becomes partitioned, the gateway still works while the limit state is eventually consistent and local to the connected cluster. This is the same practical trade-off many API security systems make: prefer fast, available enforcement over perfect global consistency.

For a production system, this is acceptable because rate limits are a best-effort control mechanism: they protect service capacity and fairness, not the source of truth for transactional business data.

## 3. Production scaling considerations

For a large production deployment, this design would scale by sharding the rate-limit keys by client or routing dimension.

Recommended path:

- keep a consistent hash on client identity (for example `clientId` and route)
- shard by client key across Redis Cluster nodes
- use a per-client bucket/slot mapping to keep hot keys distributed
- add a dedicated metrics sink for live dashboards and analytics
- keep circuit-breaker logic in the gateway to isolate failing upstream services

A typical production shape would look like:

```text
Client -> Nginx -> Gateway replicas -> Redis Cluster (sharded by client route key)
                                     -> Postgres (plan metadata)
                                     -> Backends (orders, inventory)
```

For very high-QPS systems, one might also use a dedicated Redis infrastructure with persistent AOF and cluster-enabled sharding, combined with a centralized rate-limit service or an edge gateway deployment behind regional load balancing.

## 4. Why the chosen algorithms are useful

- Token bucket: best for bursty modern APIs because it allows short traffic spikes while maintaining a long-term average.
- Fixed window: simplest model, but the boundary burst issue is real and makes it poor for fairness at the exact reset point.
- Sliding window log: most precise because it counts timestamps in a rolling window; best for strict enforcement.
- Sliding window counter: cheaper approximation that works well when precision can be traded for lower memory usage.

## 5. Operational notes

- Rate-limit policy should be derived from the client plan stored in Postgres.
- The gateway should attach standard headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After`.
- Circuit breakers isolate upstream outages while the gateway still returns a fallback response instead of a hang.
- Structured logging with request IDs is essential for production debugging and traceability.

The overall architecture is designed to be fast, horizontally scalable, and operationally understandable while still respecting the realities of distributed systems.

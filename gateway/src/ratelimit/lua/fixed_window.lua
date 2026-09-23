-- Fixed window counter tracks a count over a static time window.
-- It is very simple, fast, and easy to reason about, but it has a documented boundary-burst flaw:
-- a client can send a burst right at the window boundary because the counter resets all at once.
-- This script still enforces atomicity with the Redis server via EVAL, but the algorithm itself is intentionally less smooth.

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])

local windowStart = math.floor(now / windowMs) * windowMs
local compositeKey = key .. ':' .. windowStart
local count = tonumber(redis.call('GET', compositeKey) or '0')
local allowed = count < limit

if allowed then
  redis.call('INCR', compositeKey)
end

local ttl = math.max(1, windowMs - (now - windowStart))
redis.call('PEXPIRE', compositeKey, ttl)

return { allowed and 1 or 0, count + (allowed and 1 or 0), windowStart + windowMs }

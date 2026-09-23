-- Token bucket algorithm: a token is a unit of capacity. Each request consumes one token.
-- The bucket refills at a constant rate, which makes bursts possible while still enforcing a long-term average.
-- We perform an atomic increment-and-check inside Redis so each gateway instance sees the same shared truth.
-- If we did a naive GET and then SET, two instances could both read the same old value, both decide they are allowed,
-- and both increment, causing overcounting. Lua prevents this because Redis executes the script as one atomic operation.

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local windowMs = tonumber(ARGV[5])

local bucket = redis.call('HGETALL', key)
local tokens = burst
local lastRefill = now

if #bucket > 0 then
  local map = {}
  for i = 1, #bucket, 2 do
    map[bucket[i]] = bucket[i + 1]
  end
  tokens = tonumber(map['tokens']) or burst
  lastRefill = tonumber(map['last_refill']) or now
end

local elapsed = math.max(0, now - lastRefill)
local refill = (elapsed / 1000) * refillRate
if refill > 0 then
  tokens = tokens + refill
  lastRefill = now
end

if tokens > burst then
  tokens = burst
end

local allowed = tokens >= 1
if allowed then
  tokens = tokens - 1
end

local remaining = math.max(0, math.floor(tokens))
local resetAt = now + windowMs

redis.call('HSET', key, 'tokens', tostring(tokens), 'last_refill', tostring(lastRefill))
redis.call('PEXPIRE', key, windowMs)

return { allowed and 1 or 0, remaining, resetAt }

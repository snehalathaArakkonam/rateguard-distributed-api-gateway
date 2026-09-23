-- Sliding window log keeps a timestamped list of requests for a client.
-- It is precise: for any current time, we examine the log and count entries within the last window.
-- Memory cost is higher because each request creates an entry, but it is accurate under concurrency and avoids the boundary burst issue.
-- A naive GET+SET approach would not only race but also lose events because multiple instances would overwrite the same log list.

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local windowStart = now - windowMs

local existing = redis.call('ZRANGE', key, 0, -1, 'WITHSCORES')
local events = {}
local index = 1

for i = 1, #existing, 2 do
  local ts = tonumber(existing[i + 1])
  if ts >= windowStart then
    table.insert(events, ts)
  end
end

local count = #events
local allowed = count < limit

if allowed then
  redis.call('ZADD', key, now, tostring(now) .. ':' .. tostring(redis.call('INCR', key .. ':seq')))
end

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
redis.call('PEXPIRE', key, windowMs + 1000)

return { allowed and 1 or 0, count + (allowed and 1 or 0), now + windowMs }

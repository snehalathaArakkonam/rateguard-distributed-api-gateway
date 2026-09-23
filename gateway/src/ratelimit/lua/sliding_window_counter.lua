-- Sliding window counter approximates the precise log using a rolling count and a previous window count,
-- making memory more efficient than a full log while reducing the boundary jitter seen in fixed windows.
-- It is a hybrid approach: the algorithm is approximated and may sometimes over- or undercount near the window boundary,
-- but it is much cheaper than storing every timestamp.

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local currentWindow = math.floor(now / windowMs) * windowMs
local previousWindow = currentWindow - windowMs
local currentKey = key .. ':current'
local previousKey = key .. ':previous'

local currentCount = tonumber(redis.call('GET', currentKey) or '0')
local previousCount = tonumber(redis.call('GET', previousKey) or '0')

local currentWindowAge = now - currentWindow
local ratio = currentWindowAge / windowMs
local estimated = currentCount + (previousCount * (1 - ratio))
local allowed = estimated < limit

if allowed then
  redis.call('INCR', currentKey)
end

redis.call('EXPIRE', currentKey, windowMs / 1000 + 5)
redis.call('EXPIRE', previousKey, (windowMs * 2) / 1000 + 5)

return { allowed and 1 or 0, math.floor(estimated + (allowed and 1 or 0)), now + windowMs }

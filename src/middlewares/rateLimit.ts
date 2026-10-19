import { Request, Response, NextFunction } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const getClientKey = (req: Request, keyPrefix: string): string => {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;

  if (userId) return `${keyPrefix}:user:${userId}`;

  return `${keyPrefix}:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
};

/**
 * Lightweight fixed-window limiter for sensitive endpoints.
 *
 * This is intentionally process-local: it is a defence-in-depth control against
 * high-volume question-bank harvesting, not a distributed quota. Multi-instance
 * deployments should replace the Map with Redis when available.
 */
export const rateLimit = ({ windowMs, max, keyPrefix }: RateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = getClientKey(req, keyPrefix);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfter = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));

      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down.',
        data: null,
      });
    }

    bucket.count += 1;

    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    return next();
  };
};

export default rateLimit;

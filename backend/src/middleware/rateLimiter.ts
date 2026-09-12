import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: 'Too many requests, please try again later.' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: 'Too many requests, please try again later.' },
});

// Guest-facing unified search fans out to 4x the DB work of a single list
// call (one query+count pair per content type) and has no auth friction to
// slow down abuse — tighter than the general apiLimiter it sits alongside.
export const discoverySearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: 'Too many search requests, please try again later.' },
});

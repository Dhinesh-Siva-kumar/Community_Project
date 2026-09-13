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

// OTP send/verify is a Twilio-cost and brute-force vector; kept as its own
// bucket rather than reusing authLimiter so it doesn't share a quota with
// unrelated /api/auth/* traffic.
export const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
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

// Student Connect — connection requests and chat messages are the two
// write-heavy endpoints worth a tighter cap than the general apiLimiter,
// same reasoning as discoverySearchLimiter above.
export const studentConnectionRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: 'Too many connection requests, please try again later.' },
});

export const studentChatMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: 'Too many messages, please slow down.' },
});

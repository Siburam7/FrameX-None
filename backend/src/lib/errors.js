/* Consistent API errors: { "error": { "code", "message", "fields"? } }.
   Customers never see stack traces; unexpected errors are logged server-side only. */
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export const errors = {
  badRequest: (message = "The request could not be understood.", code = "BAD_REQUEST") => new HttpError(400, code, message),
  unauthorized: (message = "Please log in to continue.", code = "UNAUTHORIZED") => new HttpError(401, code, message),
  forbidden: (message = "You don't have permission to do that.", code = "FORBIDDEN") => new HttpError(403, code, message),
  notFound: (message = "Not found.", code = "NOT_FOUND") => new HttpError(404, code, message),
  conflict: (message, fields, code = "CONFLICT") => new HttpError(409, code, message, fields ? { fields } : {}),
  validation: (fields, message = "Please check the highlighted fields.") => new HttpError(422, "VALIDATION_ERROR", message, { fields }),
  tooMany: (retryAfterSeconds) => new HttpError(429, "TOO_MANY_REQUESTS", "Too many attempts. Please wait a little and try again.", { retryAfterSeconds })
};

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "This address doesn't exist." } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    if (err.retryAfterSeconds) res.set("Retry-After", String(err.retryAfterSeconds));
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}), ...(err.details ? { details: err.details } : {}), ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}) } });
  }
  // Malformed JSON / oversized body from express.json()
  if (err && (err.type === "entity.parse.failed" || err.type === "entity.too.large")) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "The request body could not be read." } });
  }
  // Database unique violations that slipped past the pre-checks.
  if (err && err.code === "23505") {
    return res.status(409).json({ error: { code: "CONFLICT", message: "That already exists." } });
  }
  // Never log request bodies (they can contain passwords).
  console.error(`[error] ${req.method} ${req.path}:`, err && err.stack ? err.stack : err);
  res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong on our side. Please try again." } });
}

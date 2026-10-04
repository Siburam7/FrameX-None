/* Per-request context (no globals): lets deep code such as "build a reset link"
   know which allowed website the request came from, without threading a
   parameter through every function. */
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config.js";
import { isAllowedOrigin } from "./security.js";

const storage = new AsyncLocalStorage();

export function requestContext(req, res, next) {
  // Links in emails go to FRONTEND_URL when it is set; otherwise back to the
  // (allowed) website the request came from, e.g. Live Server on port 5500.
  const origin = req.headers.origin;
  const linkBase = !config.frontendUrlSet && origin && isAllowedOrigin(origin, req) ? origin : config.frontendUrl;
  storage.run({ linkBase }, next);
}

export const linkBase = () => (storage.getStore() || {}).linkBase || config.frontendUrl;

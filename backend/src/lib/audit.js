/* Audit trail for important actions (who, what, on what, when).
   Written inside the same transaction as the change it records. */
import { newId } from "./tokens.js";

export const ACTIONS = {
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  APPLICATION_UNDER_REVIEW: "APPLICATION_UNDER_REVIEW",
  APPLICATION_REJECTED: "APPLICATION_REJECTED",
  SHOP_APPROVED: "SHOP_APPROVED",
  SHOP_CREATED: "SHOP_CREATED",
  SHOP_REJECTED: "SHOP_REJECTED",
  SHOP_UPDATED: "SHOP_UPDATED",
  SHOP_ACTIVATED: "SHOP_ACTIVATED",
  SHOP_DEACTIVATED: "SHOP_DEACTIVATED",
  SHOP_ACCOUNT_CREATED: "SHOP_ACCOUNT_CREATED",
  SHOP_CREDENTIALS_ISSUED: "SHOP_CREDENTIALS_ISSUED",
  SHOP_ACCOUNT_DISABLED: "SHOP_ACCOUNT_DISABLED",
  SHOP_ACCOUNT_ENABLED: "SHOP_ACCOUNT_ENABLED",
  SHOP_PROFILE_UPDATED: "SHOP_PROFILE_UPDATED",
  PASSWORD_RESET: "PASSWORD_RESET",
  ACCOUNT_SETUP_COMPLETED: "ACCOUNT_SETUP_COMPLETED"
};

/** q is db or a transaction; actor is req.auth.user (or null for system / public actions). */
export function audit(q, { actor = null, action, targetType, targetId = null, metadata = {}, ip = null }) {
  return q.query(
    `INSERT INTO audit_logs (id, actor_user_id, actor_role, action, target_type, target_id, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newId(), actor ? actor.id : null, actor ? actor.role : null, action, targetType, targetId, JSON.stringify(metadata), ip]
  );
}

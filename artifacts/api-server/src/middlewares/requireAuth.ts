import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";

/**
 * Middleware that rejects unauthenticated requests with 401.
 * Mount before any business route that requires a logged-in user.
 */
export const requireAuth: RequestHandler = (req, res, next): void => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

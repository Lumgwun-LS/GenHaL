import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";

export interface ExternalUser {
  vendorId: number;
  awajimaaUserId: string;
  awajimaaUserType: "state" | "hospital" | "emergency" | "business" | "individual";
  source: string;
  jti: string;
}

// Extend Express Request with our external user context
declare global {
  namespace Express {
    interface Request {
      externalUser?: ExternalUser;
    }
  }
}

/**
 * Feature access matrix per Awajimaa user type.
 * Returned in /external/auth/handshake so the Android app
 * knows which VendorHub modules to show the user.
 */
export const FEATURE_ACCESS: Record<string, string[]> = {
  state:      ["analytics", "campaigns", "social", "leads"],
  hospital:   ["inventory", "orders", "products", "social", "leads", "campaigns"],
  emergency:  ["inventory", "social", "leads"],
  business:   ["products", "inventory", "orders", "leads", "social", "campaigns", "analytics"],
  individual: ["social", "orders", "leads"],
};

export const requireExternalAuth: RequestHandler = (req, res, next): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing external auth token" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as ExternalUser & { iat: number; exp: number };
    if (payload.source !== "awajimaa" && payload.source !== "mobile-app") {
      res.status(401).json({ error: "Invalid token source" });
      return;
    }
    req.externalUser = {
      vendorId: payload.vendorId,
      awajimaaUserId: payload.awajimaaUserId,
      awajimaaUserType: payload.awajimaaUserType,
      source: payload.source,
      jti: payload.jti,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

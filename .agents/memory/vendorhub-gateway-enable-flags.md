---
    name: Per-vendor gateway enable flags
    description: Pattern for gating a new payment gateway's checkout per vendor, mirroring stripeEnabled/paystackEnabled.
    ---

    A new payment gateway's checkout route must be gated on both (a) platform credentials existing and (b) a per-vendor enable flag, and the admin endpoint that flips that flag must itself be admin-only.

    **Why:** Platform-level credentials make a gateway usable by all vendors unless each checkout route also checks a vendor-specific flag. That flag is only a real access control if the endpoint that sets it enforces admin identity — otherwise any authenticated user can grant themselves (or another vendor) access to a gateway.

    **How to apply:** Follow the existing stripeEnabled/paystackEnabled precedent for schema, checkout-route gating, and admin UI; the easy part to forget is authorizing the settings-update endpoint itself as admin-only (same admin allowlist pattern used by `PATCH /vendors/:id`).
    
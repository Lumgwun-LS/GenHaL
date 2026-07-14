---
name: Public shop-link checkout retry
description: Access-control and state-machine rules for letting an unauthenticated customer retry a failed shop-link payment.
---

An unauthenticated checkout flow that lets a customer look up or retry an order (by
token + orderId, with no login) must not scope the lookup by vendor alone — a valid
public token only proves "right vendor," not "right order." Also persist which specific
link/context created the order (e.g. the originating post) and require that too, or the
token can be used to enumerate/retry *any* order for that vendor, including ones never
placed through this flow.

**Why:** vendor-only scoping is IDOR-shaped — order ids are sequential and guessable.

**How to apply:** any new unauthenticated "resume/retry my order" endpoint needs two
checks: (1) an explicit link-to-order provenance column set at creation and verified on
every lookup, not inferred from vendor ownership; (2) retry eligibility gated by an
explicit allow-list of recoverable states (e.g. unpaid/failed) rather than an exclude-list
of one terminal state (e.g. just "not paid") — exclude-lists silently let other terminal
states (refunded, cancelled) through.

---
    name: twilio-webhook-signature
    description: How to verify X-Twilio-Signature when the Replit Twilio connector only exposes API Key credentials, not the classic Auth Token.
    ---

    The Replit Twilio connector's settings expose account_sid, api_key, api_key_secret, phone_number — no auth_token field, and getProxyHeaders()/listConnections() never surface the raw Basic-Auth credentials to app code (redacted at the proxy boundary).

    Twilio always signs webhooks (X-Twilio-Signature) with the account's primary Auth Token specifically — API Key secrets cannot be substituted. Since the connector can't provide it, request TWILIO_AUTH_TOKEN as a separate secret via requestSecrets() and use twilio.validateRequest(authToken, signature, url, body) in Express routes that receive Twilio webhooks (status callbacks, etc).

    The callback URL used for signature validation must exactly match what was given to Twilio as the callback URL (same domain precedence logic, same path, no query string) — rebuild it from the same PUBLIC_APP_DOMAIN/REPLIT_DEV_DOMAIN precedence used when constructing the original StatusCallback URL.
    
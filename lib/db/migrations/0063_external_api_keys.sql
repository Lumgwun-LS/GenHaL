-- API keys issued to external systems (e.g. Awajimaa Spring Boot backend).
-- Each key identifies the calling application and grants access to the
-- /api/external/* handshake endpoint.
CREATE TABLE IF NOT EXISTS external_api_keys (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  key_hash   text NOT NULL UNIQUE,
  source     text NOT NULL DEFAULT 'awajimaa',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone
);

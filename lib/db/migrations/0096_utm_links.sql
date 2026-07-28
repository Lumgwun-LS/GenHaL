CREATE TABLE IF NOT EXISTS utm_links (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  destination_url text NOT NULL,
  utm_source text NOT NULL,
  utm_medium text NOT NULL,
  utm_campaign text NOT NULL,
  utm_content text,
  utm_term text,
  short_code text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utm_links_short_code_unique UNIQUE (short_code)
);

CREATE INDEX IF NOT EXISTS utm_links_vendor_id_idx ON utm_links(vendor_id);

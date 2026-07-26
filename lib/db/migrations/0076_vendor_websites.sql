CREATE TABLE IF NOT EXISTS vendor_websites (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  template_id text NOT NULL DEFAULT 'modern-shop',
  theme_color text NOT NULL DEFAULT '#7F50FF',
  published boolean NOT NULL DEFAULT false,
  sections_json jsonb NOT NULL DEFAULT '[]',
  page_title text,
  meta_description text,
  logo_url text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

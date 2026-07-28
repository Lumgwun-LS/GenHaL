CREATE TABLE IF NOT EXISTS lead_forms (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]',
  redirect_url text,
  button_text text NOT NULL DEFAULT 'Submit',
  thank_you_message text,
  status text NOT NULL DEFAULT 'active',
  submissions_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

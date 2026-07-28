CREATE TABLE IF NOT EXISTS person_activities (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS person_activities_vendor_id_idx ON person_activities(vendor_id);
CREATE INDEX IF NOT EXISTS person_activities_person_id_idx ON person_activities(person_id);

-- Product variations: JSON array of {name, options[]}
ALTER TABLE products ADD COLUMN IF NOT EXISTS variations_json text;

-- Add region and city to store_app_events for state/city-level geo analytics
ALTER TABLE store_app_events ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE store_app_events ADD COLUMN IF NOT EXISTS city text;

-- Real Estate Module: properties, clients, viewings, contracts, inquiries
CREATE TABLE IF NOT EXISTS "properties" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "property_type" text NOT NULL,
  "listing_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'available',
  "price" text,
  "rent_price" text,
  "rent_period" text,
  "bedrooms" integer,
  "bathrooms" integer,
  "area" text,
  "area_unit" text DEFAULT 'sqm',
  "address" text,
  "city" text,
  "state" text,
  "country" text,
  "features" text[],
  "images" text[],
  "views" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "real_estate_clients" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "client_type" text NOT NULL DEFAULT 'buyer',
  "budget" text,
  "preferred_areas" text,
  "notes" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "property_viewings" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "property_id" integer REFERENCES "properties"("id") ON DELETE SET NULL,
  "client_id" integer REFERENCES "real_estate_clients"("id") ON DELETE SET NULL,
  "client_name" text NOT NULL,
  "client_email" text,
  "client_phone" text,
  "scheduled_at" timestamp NOT NULL,
  "status" text NOT NULL DEFAULT 'scheduled',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "property_contracts" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "property_id" integer REFERENCES "properties"("id") ON DELETE SET NULL,
  "client_id" integer REFERENCES "real_estate_clients"("id") ON DELETE SET NULL,
  "contract_type" text NOT NULL,
  "document_url" text,
  "document_name" text,
  "status" text NOT NULL DEFAULT 'draft',
  "valid_from" timestamp,
  "valid_until" timestamp,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "property_inquiries" (
  "id" serial PRIMARY KEY,
  "property_id" integer REFERENCES "properties"("id") ON DELETE CASCADE,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "message" text,
  "source" text DEFAULT 'public_page',
  "created_at" timestamp NOT NULL DEFAULT now()
);

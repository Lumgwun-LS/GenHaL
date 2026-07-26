CREATE TABLE IF NOT EXISTS "invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "customer_name" text NOT NULL,
  "customer_email" text,
  "customer_phone" text,
  "currency" text NOT NULL DEFAULT 'USD',
  "subtotal" numeric(15, 2) NOT NULL DEFAULT 0,
  "discount_amount" numeric(15, 2) NOT NULL DEFAULT 0,
  "tax_amount" numeric(15, 2) NOT NULL DEFAULT 0,
  "total_amount" numeric(15, 2) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft',
  "due_date" date,
  "share_token" text NOT NULL UNIQUE,
  "notes" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "invoice_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoice_id" integer NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "quantity" numeric(10, 3) NOT NULL DEFAULT 1,
  "unit_price" numeric(15, 2) NOT NULL DEFAULT 0,
  "total_price" numeric(15, 2) NOT NULL DEFAULT 0,
  "type" text NOT NULL DEFAULT 'service',
  "product_id" integer
);

CREATE TABLE IF NOT EXISTS "invoice_instalment_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoice_id" integer NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "instalment_number" integer NOT NULL,
  "amount" numeric(15, 2) NOT NULL,
  "due_date" date,
  "status" text NOT NULL DEFAULT 'pending',
  "payment_id" integer REFERENCES "payments"("id") ON DELETE SET NULL,
  "paid_at" timestamptz,
  "reminder_sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "invoices_vendor_id_idx" ON "invoices" ("vendor_id");
CREATE INDEX IF NOT EXISTS "invoices_share_token_idx" ON "invoices" ("share_token");
CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_idx" ON "invoice_items" ("invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_instalment_payments_invoice_id_idx" ON "invoice_instalment_payments" ("invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_instalment_payments_status_idx" ON "invoice_instalment_payments" ("status");

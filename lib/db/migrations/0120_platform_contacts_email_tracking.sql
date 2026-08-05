-- Platform contact registry: cross-vendor email-keyed audience
CREATE TABLE platform_contacts (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  phone text,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  newsletter_opt_in boolean NOT NULL DEFAULT true,
  platform_email_sent_count integer NOT NULL DEFAULT 0,
  platform_email_open_count integer NOT NULL DEFAULT 0,
  platform_email_last_sent_at timestamptz,
  platform_email_last_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Real email open tracking (replaces hardcoded 22% simulation)
CREATE TABLE email_tracking_events (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  email_type text NOT NULL,
  campaign_id integer,
  vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL,
  platform_contact_id integer REFERENCES platform_contacts(id) ON DELETE SET NULL,
  lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0
);

-- Support tickets: link to CRM lead and platform contact
ALTER TABLE support_tickets ADD COLUMN lead_id integer REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE support_tickets ADD COLUMN platform_contact_id integer REFERENCES platform_contacts(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_platform_contacts_email ON platform_contacts(email);
CREATE INDEX idx_email_tracking_token ON email_tracking_events(token);
CREATE INDEX idx_email_tracking_campaign ON email_tracking_events(campaign_id);
CREATE INDEX idx_email_tracking_vendor ON email_tracking_events(vendor_id, sent_at);
CREATE INDEX idx_email_tracking_contact ON email_tracking_events(platform_contact_id);
CREATE INDEX idx_support_tickets_lead ON support_tickets(lead_id);

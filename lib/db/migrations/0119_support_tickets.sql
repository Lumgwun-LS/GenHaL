-- Support ticket system: vendor-shareable ticket link, threaded messages, file attachments
CREATE TABLE support_tickets (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  ticket_token text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  product_id integer,
  product_name text,
  invoice_ref text,
  order_ref text,
  post_id integer,
  first_reply_at timestamptz,
  resolved_at timestamptz,
  vendor_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_ticket_messages (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  sender_name text NOT NULL,
  content text NOT NULL,
  attachment_urls text[],
  attachment_types text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_vendor_id ON support_tickets(vendor_id);
CREATE INDEX idx_support_tickets_token ON support_tickets(ticket_token);
CREATE INDEX idx_support_tickets_vendor_status ON support_tickets(vendor_id, status);
CREATE INDEX idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id);

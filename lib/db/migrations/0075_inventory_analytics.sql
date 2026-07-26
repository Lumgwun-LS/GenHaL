-- Inventory analytics: max stock reference + alert tracking on products
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_stock_alert_level integer;

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  supplier_name text NOT NULL,
  supplier_email text,
  supplier_phone text,
  supplier_address text,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id serial PRIMARY KEY,
  purchase_order_id integer NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  total_price numeric(12, 2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Per-vendor stock alert preferences
CREATE TABLE IF NOT EXISTS vendor_stock_alert_settings (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  alert_60_enabled boolean NOT NULL DEFAULT true,
  alert_40_enabled boolean NOT NULL DEFAULT true,
  alert_20_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

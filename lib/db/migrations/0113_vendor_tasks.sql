-- Task Manager: vendor_tasks table
CREATE TABLE IF NOT EXISTS vendor_tasks (
  id                    serial PRIMARY KEY,
  vendor_id             integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text,
  status                text NOT NULL DEFAULT 'todo',         -- todo | in_progress | done | cancelled
  priority              text NOT NULL DEFAULT 'medium',       -- low | medium | high | urgent
  due_date              timestamptz,
  image_url             text,
  video_url             text,
  branch_id             integer REFERENCES branches(id) ON DELETE SET NULL,
  worker_id             integer REFERENCES workers(id) ON DELETE SET NULL,
  customer_id           integer REFERENCES customers(id) ON DELETE SET NULL,
  lead_id               integer REFERENCES leads(id) ON DELETE SET NULL,
  task_type             text NOT NULL DEFAULT 'general',      -- general | call_customer | send_message | send_invoice | send_product
  task_data             text,                                  -- JSON for type-specific automation data
  automated_action      boolean NOT NULL DEFAULT false,       -- auto-execute action at due_date
  reminder_sent_at      timestamptz,
  action_executed_at    timestamptz,
  completed_at          timestamptz,
  completed_by_clerk_id text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendor_tasks_vendor_id_idx   ON vendor_tasks(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_tasks_status_idx      ON vendor_tasks(vendor_id, status);
CREATE INDEX IF NOT EXISTS vendor_tasks_due_date_idx    ON vendor_tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendor_tasks_worker_id_idx   ON vendor_tasks(worker_id) WHERE worker_id IS NOT NULL;

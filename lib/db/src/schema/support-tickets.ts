import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * Support ticket status lifecycle:
 *   open → in_progress (vendor replies) → resolved → closed
 *   Any status can be re-opened to "open" by a new customer message.
 */
export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  /** Unique token given to the customer so they can view thread progress without auth */
  ticketToken: text("ticket_token").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  subject: text("subject").notNull(),
  /** general | product | invoice | order | post */
  category: text("category").notNull().default("general"),
  /** open | in_progress | resolved | closed */
  status: text("status").notNull().default("open"),
  /** low | normal | high | urgent */
  priority: text("priority").notNull().default("normal"),
  /** Optional reference to a specific product */
  productId: integer("product_id"),
  productName: text("product_name"),
  /** Customer-supplied invoice or order reference text */
  invoiceRef: text("invoice_ref"),
  orderRef: text("order_ref"),
  /** Optional reference to a social post */
  postId: integer("post_id"),
  /** Timestamp of vendor's first reply — used for response-time metrics */
  firstReplyAt: timestamp("first_reply_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  /** When the vendor last viewed this ticket's messages */
  vendorLastReadAt: timestamp("vendor_last_read_at", { withTimezone: true }),
  /** CRM lead row for this customer (set when ticket is submitted) */
  leadId: integer("lead_id"),
  /** Platform-wide contact registry row for this customer */
  platformContactId: integer("platform_contact_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportTicketMessagesTable = pgTable("support_ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  /** "customer" | "vendor" */
  senderType: text("sender_type").notNull(),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  /** Object-storage URLs for uploaded images/videos */
  attachmentUrls: text("attachment_urls").array(),
  /** "image" | "video" — parallel to attachmentUrls */
  attachmentTypes: text("attachment_types").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type SupportTicketMessage = typeof supportTicketMessagesTable.$inferSelect;

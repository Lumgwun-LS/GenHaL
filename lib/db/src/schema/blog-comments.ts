import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const blogCommentsTable = pgTable("blog_comments", {
  id:             serial("id").primaryKey(),
  postId:         integer("post_id").notNull(),
  vendorId:       integer("vendor_id").notNull(),
  commenterName:  text("commenter_name").notNull(),
  commenterEmail: text("commenter_email").notNull(),
  commenterPhone: text("commenter_phone"),
  body:           text("body").notNull(),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blogPostLikesTable = pgTable("blog_post_likes", {
  id:           serial("id").primaryKey(),
  postId:       integer("post_id").notNull(),
  visitorToken: text("visitor_token").notNull(),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

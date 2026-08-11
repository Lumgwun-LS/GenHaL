import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const blogPostsTable = pgTable("blog_posts", {
  id:             serial("id").primaryKey(),
  vendorId:       integer("vendor_id").notNull(),
  title:          text("title").notNull(),
  slug:           text("slug").notNull().unique("blog_posts_slug_key"),
  coverImageUrl:  text("cover_image_url"),
  bodyHtml:       text("body_html").notNull().default(""),
  excerpt:        text("excerpt"),
  keywords:       text("keywords").array().notNull().default([]),
  status:         text("status").notNull().default("draft"), // draft | published
  viewCount:      integer("view_count").notNull().default(0),
  likeCount:      integer("like_count").notNull().default(0),
  commentCount:   integer("comment_count").notNull().default(0),
  featuredOnPlatform:    boolean("featured_on_platform").notNull().default(true),
  suspendedFromGlobal:   boolean("suspended_from_global").notNull().default(false),
  publishedAt:    timestamp("published_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

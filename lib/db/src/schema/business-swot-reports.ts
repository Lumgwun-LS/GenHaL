import { pgTable, serial, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export type SwotPoint = {
  point: string;
  linkKey?: string;
  linkLabel?: string;
};

export type SwotReportData = {
  strengths: SwotPoint[];
  weaknesses: SwotPoint[];
  opportunities: SwotPoint[];
  threats: SwotPoint[];
};

export type ScoreDimension = {
  score: number;
  max: number;
  label: string;
};

export const businessSwotReportsTable = pgTable("business_swot_reports", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  healthScore: numeric("health_score", { precision: 5, scale: 2 }).notNull().default("0"),
  scoreBreakdown: jsonb("score_breakdown").$type<Record<string, ScoreDimension>>().notNull().default({}),
  swotReport: jsonb("swot_report").$type<SwotReportData>().notNull(),
  snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

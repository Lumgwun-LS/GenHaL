import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export const propertiesTable = pgTable("properties", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  propertyType: text("property_type").notNull(), // residential, commercial, land, shortlet
  listingType: text("listing_type").notNull(), // sale, rent, both
  status: text("status").notNull().default("available"), // available, under_offer, sold, rented
  price: text("price"),
  rentPrice: text("rent_price"),
  rentPeriod: text("rent_period"), // monthly, yearly
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  area: text("area"),
  areaUnit: text("area_unit").default("sqm"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  features: text("features").array(),
  images: text("images").array(),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const realEstateClientsTable = pgTable("real_estate_clients", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  clientType: text("client_type").notNull().default("buyer"), // buyer, seller, tenant, landlord
  budget: text("budget"),
  preferredAreas: text("preferred_areas"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const propertyViewingsTable = pgTable("property_viewings", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => realEstateClientsTable.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled, completed, cancelled, no_show
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const propertyContractsTable = pgTable("property_contracts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => realEstateClientsTable.id, { onDelete: "set null" }),
  contractType: text("contract_type").notNull(), // sale_agreement, lease, offer_letter, other
  documentUrl: text("document_url"),
  documentName: text("document_name"),
  status: text("status").notNull().default("draft"), // draft, signed, expired, cancelled
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const propertyInquiriesTable = pgTable("property_inquiries", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  message: text("message"),
  source: text("source").default("public_page"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

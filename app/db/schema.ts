import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Money is stored as REAL (a 2-decimal value the user entered). All arithmetic
// goes through app/lib/pricing.ts, which computes in integer cents to avoid
// floating-point drift. There is no currency — see formatMoney in app/lib/money.ts.

const createdAt = () =>
	integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`);

// Single-row app settings (id is always 1).
export const settings = sqliteTable("settings", {
	id: integer("id").primaryKey().default(1),
	businessName: text("business_name").notNull().default("middleguy"),
	address: text("address").notNull().default(""),
	contact: text("contact").notNull().default(""),
	logoKey: text("logo_key"), // R2 key, nullable
	defaultMarkupPercent: real("default_markup_percent").notNull().default(0),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export const vendors = sqliteTable("vendors", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	phone: text("phone").notNull().default(""),
	email: text("email").notNull().default(""),
	notes: text("notes").notNull().default(""),
	createdAt: createdAt(),
});

export const partners = sqliteTable("partners", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	phone: text("phone").notNull().default(""),
	email: text("email").notNull().default(""),
	createdAt: createdAt(),
});

export const rfqs = sqliteTable("rfqs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	vendorId: integer("vendor_id").references(() => vendors.id, {
		onDelete: "set null",
	}),
	title: text("title").notNull().default(""),
	// draft | sent | quoted | closed
	status: text("status").notNull().default("draft"),
	notes: text("notes").notNull().default(""),
	createdAt: createdAt(),
});

export const rfqSections = sqliteTable("rfq_sections", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	rfqId: integer("rfq_id")
		.notNull()
		.references(() => rfqs.id, { onDelete: "cascade" }),
	title: text("title").notNull().default(""),
	sortOrder: integer("sort_order").notNull().default(0),
});

export const rfqItems = sqliteTable("rfq_items", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	rfqId: integer("rfq_id")
		.notNull()
		.references(() => rfqs.id, { onDelete: "cascade" }),
	sectionId: integer("section_id").references(() => rfqSections.id, {
		onDelete: "set null",
	}),
	name: text("name").notNull().default(""),
	qty: real("qty").notNull().default(1),
	unit: text("unit").notNull().default(""),
	targetPrice: real("target_price"), // nullable
	notes: text("notes").notNull().default(""),
	sortOrder: integer("sort_order").notNull().default(0),
});

export const invoices = sqliteTable("invoices", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	rfqId: integer("rfq_id").references(() => rfqs.id, { onDelete: "set null" }),
	vendorId: integer("vendor_id").references(() => vendors.id, {
		onDelete: "set null",
	}),
	partnerId: integer("partner_id").references(() => partners.id, {
		onDelete: "set null",
	}),
	invoiceNumber: text("invoice_number").notNull().default(""),
	originalFileKey: text("original_file_key"), // R2 key of the vendor's invoice
	// draft | sent | accepted | partner_paid | vendor_paid | received | settled | cancelled
	status: text("status").notNull().default("draft"),
	markupPercent: real("markup_percent").notNull().default(0),
	shareToken: text("share_token").unique(), // nullable until shared
	parseRaw: text("parse_raw"), // JSON audit of the AI parser output
	notes: text("notes").notNull().default(""),
	acceptedAt: integer("accepted_at", { mode: "timestamp" }),
	partnerPaidAt: integer("partner_paid_at", { mode: "timestamp" }),
	vendorPaidAt: integer("vendor_paid_at", { mode: "timestamp" }),
	receivedAt: integer("received_at", { mode: "timestamp" }),
	settledAt: integer("settled_at", { mode: "timestamp" }),
	createdAt: createdAt(),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export const invoiceLines = sqliteTable("invoice_lines", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	invoiceId: integer("invoice_id")
		.notNull()
		.references(() => invoices.id, { onDelete: "cascade" }),
	name: text("name").notNull().default(""),
	qty: real("qty").notNull().default(1),
	// Base amount per unit: vendor cost for parsed lines, or the charge the owner
	// types for manual lines.
	unitPrice: real("unit_price").notNull().default(0),
	// Whether the global margin applies to this line.
	markedUp: integer("marked_up", { mode: "boolean" }).notNull().default(true),
	// false = parsed vendor line (counts as cost in profit); true = manual charge.
	isManual: integer("is_manual", { mode: "boolean" }).notNull().default(false),
	receivedQty: real("received_qty"), // nullable until reconciliation
	sortOrder: integer("sort_order").notNull().default(0),
});

// Internal cost log only — never shown to the customer, never auto-added as a line.
export const shippingCosts = sqliteTable("shipping_costs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	invoiceId: integer("invoice_id")
		.notNull()
		.references(() => invoices.id, { onDelete: "cascade" }),
	label: text("label").notNull().default(""),
	courier: text("courier").notNull().default(""), // billed by / courier
	amount: real("amount").notNull().default(0),
	paidAt: integer("paid_at", { mode: "timestamp" }),
	notes: text("notes").notNull().default(""),
	sortOrder: integer("sort_order").notNull().default(0),
});

export type Settings = typeof settings.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type Rfq = typeof rfqs.$inferSelect;
export type RfqSection = typeof rfqSections.$inferSelect;
export type RfqItem = typeof rfqItems.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type ShippingCost = typeof shippingCosts.$inferSelect;

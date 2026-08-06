import { integer, pgTable, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { cards } from "./cards";

// singleton - one row, refreshed in place every 12h by CronJobs.runStorefrontRefresh
export const storefront = pgTable("storefront", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  cardIds: integer().array().notNull(),
  refreshedAt: timestamp().notNull().defaultNow(),
});

// one-purchase-per-card-per-rotation guard - wiped wholesale on every refresh, so this only
// ever holds rows for the current rotation, not an ever-growing purchase log
export const storefrontPurchases = pgTable("storefront_purchases", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull().references(() => users.id),
  cardId: integer().notNull().references(() => cards.id),
  storefrontId: integer().notNull().references(() => storefront.id),
  createdAt: timestamp().notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.cardId, t.storefrontId)]);

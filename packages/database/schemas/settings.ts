import { pgTable, integer, boolean } from "drizzle-orm/pg-core";

// singleton row
export const settings = pgTable("settings", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  enableDiscoteca: boolean().notNull().default(true),
});

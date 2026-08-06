import "dotenv/config";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import * as schema_cards from "./schemas/cards";
import * as schema_users from "./schemas/users";
import * as schema_audit from "./schemas/audit";
import * as schema_promo from "./schemas/promo";
import * as schema_economy from "./schemas/economy";
import * as schema_discoteca from "./schemas/discoteca";
import * as schema_settings from "./schemas/settings";
import * as schema_storefront from "./schemas/storefront";

export const config = { connectionString: process.env.DATABASE_URL!, max: Number(process.env.DB_POOL_MAX) || 15 };
const pool = new Pool(config);

const schema = { ...schema_cards, ...schema_users, ...schema_audit, ...schema_promo, ...schema_economy, ...schema_discoteca, ...schema_settings, ...schema_storefront };

export const db = drizzle(pool, { schema });
export const dataSource = new DrizzleDataSource<NodePgDatabase<typeof schema>>('app-db', config);

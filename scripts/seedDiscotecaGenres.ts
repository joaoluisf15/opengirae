import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { discotecaGenres, discotecaSubcategories } from "../packages/database/schemas/discoteca";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const baseNames = [
  "Pop",
  "Alternativo",
  "Punk/Rock",
  "R&B/Soul",
  "Jazz",
  "Latin/Reggaeton",
  "Funk",
  "Samba/Pagode",
  "MPB",
  "Sertanejo",
  "Hip-Hop/Rap",
  "Música Religiosa",
  "Country",
  "Eletrônica",
];

try {
  let subcategoryCount = 0;
  for (const baseName of baseNames) {
    const genre = (await db.insert(discotecaGenres).values({ name: baseName }).onConflictDoNothing().returning())[0]
      ?? await db.select().from(discotecaGenres).where(eq(discotecaGenres.name, baseName)).then(r => r[0]);
    if (!genre) continue;

    await db.insert(discotecaSubcategories).values([
      { genreId: genre.id, isAlbum: true, name: `Álbuns de ${baseName}`, emoji: "💽" },
      { genreId: genre.id, isAlbum: false, name: `Singles de ${baseName}`, emoji: "🎵" },
    ]).onConflictDoNothing();
    subcategoryCount += 2;
  }
  console.log(`Seeded ${baseNames.length} discoteca genres and ${subcategoryCount} subcategories.`);
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error("Seed failed:", err);
  await pool.end();
  process.exit(1);
}

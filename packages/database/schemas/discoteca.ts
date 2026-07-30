import { users } from "./users";
import { rarities } from "./cards";
import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  primaryKey,
  index,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const discotecaType = pgEnum("discoteca_type", ["single", "album"]);

export const discotecaGenres = pgTable("discoteca_genres", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
  emoji: text().notNull(),
});

export const discotecaGenreAliases = pgTable("discoteca_genre_aliases", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  genreId: integer()
    .notNull()
    .references(() => discotecaGenres.id, { onDelete: "cascade" }),
  alias: text().notNull().unique(),
});

export const discotecaEntries = pgTable(
  "discoteca_entries",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    artistName: text().notNull(),
    appleMusicId: text().notNull().unique(),
    type: discotecaType().notNull(),
    artworkUrl: text(),
    releaseDate: timestamp(),
    rarityId: integer()
      .notNull()
      .references(() => rarities.id),
    rarityModifier: integer().notNull().default(100),
    previewUrl: text(),
    albumAppleMusicId: text(),
    albumId: integer().references((): AnyPgColumn => discotecaEntries.id, { onDelete: "set null" }),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("discoteca_entries_name_trgm_idx").using("gin", sql`immutable_unaccent(${table.name}) gin_trgm_ops`),
    index("discoteca_entries_album_idx").on(table.albumId),
  ],
);

export const discotecaEntryGenres = pgTable(
  "discoteca_entry_genres",
  {
    entryId: integer()
      .notNull()
      .references(() => discotecaEntries.id, { onDelete: "cascade" }),
    genreId: integer()
      .notNull()
      .references(() => discotecaGenres.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.genreId] }),
    index("discoteca_entry_genres_genre_idx").on(table.genreId),
  ],
);

export const discotecaAlbumTracks = pgTable(
  "discoteca_album_tracks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    entryId: integer()
      .notNull()
      .references(() => discotecaEntries.id, { onDelete: "cascade" }),
    trackAppleMusicId: text().notNull(),
    name: text().notNull(),
    trackNumber: integer().notNull(),
    durationInMillis: integer().notNull(),
    isrc: text(),
    previewUrl: text(),
  },
  (table) => [index("discoteca_album_tracks_entry_idx").on(table.entryId)],
);

export const discotecaPreviewCache = pgTable("discoteca_preview_cache", {
  appleMusicTrackId: text().primaryKey(),
  cdnUrl: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const userDiscoteca = pgTable(
  "user_discoteca",
  {
    userId: integer()
      .notNull()
      .references(() => users.id),
    entryId: integer()
      .notNull()
      .references(() => discotecaEntries.id),
    count: integer().notNull().default(1),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.entryId] }),
    index("user_discoteca_entry_idx").on(table.entryId),
  ],
);

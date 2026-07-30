CREATE TYPE "public"."discoteca_type" AS ENUM('single', 'album');--> statement-breakpoint
CREATE TABLE "discoteca_album_tracks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discoteca_album_tracks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entryId" integer NOT NULL,
	"trackAppleMusicId" text NOT NULL,
	"name" text NOT NULL,
	"trackNumber" integer NOT NULL,
	"durationInMillis" integer NOT NULL,
	"isrc" text,
	"previewUrl" text
);
--> statement-breakpoint
CREATE TABLE "discoteca_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discoteca_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"artistName" text NOT NULL,
	"appleMusicId" text NOT NULL,
	"type" "discoteca_type" NOT NULL,
	"artworkUrl" text,
	"releaseDate" timestamp,
	"rarityId" integer NOT NULL,
	"rarityModifier" integer DEFAULT 100 NOT NULL,
	"previewUrl" text,
	"albumAppleMusicId" text,
	"albumId" integer,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discoteca_entries_appleMusicId_unique" UNIQUE("appleMusicId")
);
--> statement-breakpoint
CREATE TABLE "discoteca_entry_genres" (
	"entryId" integer NOT NULL,
	"genreId" integer NOT NULL,
	CONSTRAINT "discoteca_entry_genres_entryId_genreId_pk" PRIMARY KEY("entryId","genreId")
);
--> statement-breakpoint
CREATE TABLE "discoteca_genre_aliases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discoteca_genre_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"genreId" integer NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "discoteca_genre_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "discoteca_genres" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discoteca_genres_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "discoteca_genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "discoteca_preview_cache" (
	"appleMusicTrackId" text PRIMARY KEY NOT NULL,
	"cdnUrl" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_discoteca" (
	"userId" integer NOT NULL,
	"entryId" integer NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_discoteca_userId_entryId_pk" PRIMARY KEY("userId","entryId")
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "favoriteDiscotecaId" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "lastFmUsername" text;--> statement-breakpoint
ALTER TABLE "discoteca_album_tracks" ADD CONSTRAINT "discoteca_album_tracks_entryId_discoteca_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."discoteca_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_entries" ADD CONSTRAINT "discoteca_entries_rarityId_rarities_id_fk" FOREIGN KEY ("rarityId") REFERENCES "public"."rarities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_entries" ADD CONSTRAINT "discoteca_entries_albumId_discoteca_entries_id_fk" FOREIGN KEY ("albumId") REFERENCES "public"."discoteca_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_entry_genres" ADD CONSTRAINT "discoteca_entry_genres_entryId_discoteca_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."discoteca_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_entry_genres" ADD CONSTRAINT "discoteca_entry_genres_genreId_discoteca_genres_id_fk" FOREIGN KEY ("genreId") REFERENCES "public"."discoteca_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_genre_aliases" ADD CONSTRAINT "discoteca_genre_aliases_genreId_discoteca_genres_id_fk" FOREIGN KEY ("genreId") REFERENCES "public"."discoteca_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_discoteca" ADD CONSTRAINT "user_discoteca_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_discoteca" ADD CONSTRAINT "user_discoteca_entryId_discoteca_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."discoteca_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discoteca_album_tracks_entry_idx" ON "discoteca_album_tracks" USING btree ("entryId");--> statement-breakpoint
CREATE INDEX "discoteca_entries_name_trgm_idx" ON "discoteca_entries" USING gin (immutable_unaccent("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "discoteca_entries_album_idx" ON "discoteca_entries" USING btree ("albumId");--> statement-breakpoint
CREATE INDEX "discoteca_entry_genres_genre_idx" ON "discoteca_entry_genres" USING btree ("genreId");--> statement-breakpoint
CREATE INDEX "user_discoteca_entry_idx" ON "user_discoteca" USING btree ("entryId");--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_favoriteDiscotecaId_discoteca_entries_id_fk" FOREIGN KEY ("favoriteDiscotecaId") REFERENCES "public"."discoteca_entries"("id") ON DELETE no action ON UPDATE no action;
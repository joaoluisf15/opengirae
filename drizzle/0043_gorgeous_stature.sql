ALTER TABLE "discoteca_artists" ADD COLUMN "imageUrl" text;--> statement-breakpoint
ALTER TABLE "discoteca_genres" ADD COLUMN "imageUrl" text;--> statement-breakpoint
ALTER TABLE "discoteca_subcategories" ADD COLUMN "imageUrl" text;--> statement-breakpoint
CREATE INDEX "discoteca_artists_name_trgm_idx" ON "discoteca_artists" USING gin (immutable_unaccent("name") gin_trgm_ops);
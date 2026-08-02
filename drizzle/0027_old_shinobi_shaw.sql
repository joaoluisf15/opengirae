ALTER TABLE "discoteca_genres" ADD COLUMN "baseName" text NOT NULL;--> statement-breakpoint
ALTER TABLE "discoteca_genres" ADD COLUMN "isAlbum" boolean NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "discoteca_genres_base_name_is_album_idx" ON "discoteca_genres" USING btree ("baseName","isAlbum");
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_favoriteDiscotecaId_discoteca_entries_id_fk";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "favoriteDiscotecaId";--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "favoriteDiscotecaAlbumId" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "favoriteDiscotecaSingleId" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_favoriteDiscotecaAlbumId_discoteca_entries_id_fk" FOREIGN KEY ("favoriteDiscotecaAlbumId") REFERENCES "public"."discoteca_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_favoriteDiscotecaSingleId_discoteca_entries_id_fk" FOREIGN KEY ("favoriteDiscotecaSingleId") REFERENCES "public"."discoteca_entries"("id") ON DELETE no action ON UPDATE no action;

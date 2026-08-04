DROP INDEX "discoteca_entries_artist_idx";--> statement-breakpoint
CREATE INDEX "discoteca_artists_card_idx" ON "discoteca_artists" USING btree ("cardId");--> statement-breakpoint
CREATE INDEX "discoteca_entries_artist_type_idx" ON "discoteca_entries" USING btree ("artistId","type");
CREATE TABLE "discoteca_artist_apple_ids" (
	"appleMusicArtistId" text PRIMARY KEY NOT NULL,
	"artistId" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discoteca_artist_apple_ids" ADD CONSTRAINT "discoteca_artist_apple_ids_artistId_discoteca_artists_id_fk" FOREIGN KEY ("artistId") REFERENCES "public"."discoteca_artists"("id") ON DELETE cascade ON UPDATE no action;
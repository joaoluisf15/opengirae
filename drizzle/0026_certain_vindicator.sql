CREATE TABLE "discoteca_artists" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discoteca_artists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"appleMusicArtistId" text NOT NULL,
	"cardId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discoteca_artists_appleMusicArtistId_unique" UNIQUE("appleMusicArtistId")
);
--> statement-breakpoint
ALTER TABLE "discoteca_entries" ADD COLUMN "artistId" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "discoteca_artists" ADD CONSTRAINT "discoteca_artists_cardId_cards_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_entries" ADD CONSTRAINT "discoteca_entries_artistId_discoteca_artists_id_fk" FOREIGN KEY ("artistId") REFERENCES "public"."discoteca_artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discoteca_entries_artist_idx" ON "discoteca_entries" USING btree ("artistId");--> statement-breakpoint
ALTER TABLE "discoteca_entries" DROP COLUMN "artistName";
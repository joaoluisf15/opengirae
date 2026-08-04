CREATE TABLE "discoteca_album_tracks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discoteca_album_tracks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entryId" integer NOT NULL,
	"trackAppleMusicId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discoteca_album_tracks" ADD CONSTRAINT "discoteca_album_tracks_entryId_discoteca_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."discoteca_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discoteca_album_tracks_entry_idx" ON "discoteca_album_tracks" USING btree ("entryId");
CREATE TABLE "discoteca_entry_subcategories" (
	"entryId" integer NOT NULL,
	"subcategoryId" integer NOT NULL,
	CONSTRAINT "discoteca_entry_subcategories_entryId_subcategoryId_pk" PRIMARY KEY("entryId","subcategoryId")
);
--> statement-breakpoint
CREATE TABLE "discoteca_subcategories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discoteca_subcategories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"genreId" integer NOT NULL,
	"isAlbum" boolean NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "discoteca_subcategories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "discoteca_entry_genres" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "discoteca_entry_genres" CASCADE;--> statement-breakpoint
DROP INDEX "discoteca_genres_base_name_is_album_idx";--> statement-breakpoint
ALTER TABLE "discoteca_entry_subcategories" ADD CONSTRAINT "discoteca_entry_subcategories_entryId_discoteca_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."discoteca_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_entry_subcategories" ADD CONSTRAINT "discoteca_entry_subcategories_subcategoryId_discoteca_subcategories_id_fk" FOREIGN KEY ("subcategoryId") REFERENCES "public"."discoteca_subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoteca_subcategories" ADD CONSTRAINT "discoteca_subcategories_genreId_discoteca_genres_id_fk" FOREIGN KEY ("genreId") REFERENCES "public"."discoteca_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discoteca_entry_subcategories_subcategory_idx" ON "discoteca_entry_subcategories" USING btree ("subcategoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "discoteca_subcategories_genre_is_album_idx" ON "discoteca_subcategories" USING btree ("genreId","isAlbum");--> statement-breakpoint
ALTER TABLE "discoteca_genres" DROP COLUMN "baseName";--> statement-breakpoint
ALTER TABLE "discoteca_genres" DROP COLUMN "isAlbum";--> statement-breakpoint
ALTER TABLE "discoteca_genres" DROP COLUMN "emoji";
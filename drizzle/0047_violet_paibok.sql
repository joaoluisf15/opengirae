CREATE TABLE "storefront" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "storefront_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cardIds" integer[] NOT NULL,
	"refreshedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_purchases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "storefront_purchases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"cardId" integer NOT NULL,
	"storefrontId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_purchases_userId_cardId_storefrontId_unique" UNIQUE("userId","cardId","storefrontId")
);
--> statement-breakpoint
ALTER TABLE "storefront_purchases" ADD CONSTRAINT "storefront_purchases_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_purchases" ADD CONSTRAINT "storefront_purchases_cardId_cards_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_purchases" ADD CONSTRAINT "storefront_purchases_storefrontId_storefront_id_fk" FOREIGN KEY ("storefrontId") REFERENCES "public"."storefront"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "storefront" ("cardIds") SELECT ARRAY(SELECT c.id FROM "cards" c JOIN "rarities" r ON r.id = c."rarityId" WHERE r.name = 'Lendário' ORDER BY random() LIMIT 6);
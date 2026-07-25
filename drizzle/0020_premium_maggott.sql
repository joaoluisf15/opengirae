CREATE TABLE "hipoteca_holdings" (
	"sessionId" integer NOT NULL,
	"cardId" integer NOT NULL,
	"count" integer NOT NULL,
	"tradable" boolean NOT NULL,
	"customEmoji" text,
	"customMediaUrl" text,
	"customMediaType" "cativeiro_media_type",
	CONSTRAINT "hipoteca_holdings_sessionId_cardId_pk" PRIMARY KEY("sessionId","cardId")
);
--> statement-breakpoint
CREATE TABLE "hipoteca_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hipoteca_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"staffId" integer NOT NULL,
	"savedLuckModifier" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hipoteca_holdings" ADD CONSTRAINT "hipoteca_holdings_sessionId_hipoteca_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."hipoteca_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hipoteca_holdings" ADD CONSTRAINT "hipoteca_holdings_cardId_cards_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hipoteca_sessions" ADD CONSTRAINT "hipoteca_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hipoteca_sessions" ADD CONSTRAINT "hipoteca_sessions_staffId_users_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hipoteca_sessions_user_idx" ON "hipoteca_sessions" USING btree ("userId");
CREATE TABLE "subcategory_completion_rewards" (
	"userId" integer NOT NULL,
	"subcategoryId" integer NOT NULL,
	"coinsAwarded" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subcategory_completion_rewards_userId_subcategoryId_pk" PRIMARY KEY("userId","subcategoryId")
);
--> statement-breakpoint
ALTER TABLE "subcategory_completion_rewards" ADD CONSTRAINT "subcategory_completion_rewards_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategory_completion_rewards" ADD CONSTRAINT "subcategory_completion_rewards_subcategoryId_subcategories_id_fk" FOREIGN KEY ("subcategoryId") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subcategory_completion_rewards_sub_idx" ON "subcategory_completion_rewards" USING btree ("subcategoryId");
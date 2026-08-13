ALTER TABLE "cards" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "announcedAt" timestamp;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "announcedAt" timestamp;
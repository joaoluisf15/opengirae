CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;--> statement-breakpoint
CREATE INDEX "cards_name_unaccent_trgm_idx" ON "cards" USING gin (immutable_unaccent("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "subcategories_name_unaccent_trgm_idx" ON "subcategories" USING gin (immutable_unaccent("name") gin_trgm_ops);

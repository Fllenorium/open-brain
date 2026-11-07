-- An agent can propose a brand new entry, not only edits to one that exists.
-- A creation proposal has no entry yet — nothing is written into the tree until
-- the owner accepts it — so entry_id becomes nullable and new_entry says where
-- the entry would land.
ALTER TABLE "proposals" ALTER COLUMN "entry_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "new_entry" jsonb;

-- Time-boxed access: a grant that lapses stops being handed over on the next
-- boot, with no cached copy anywhere.
ALTER TABLE "connection_grants" ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
--> statement-breakpoint
-- Which agent was handed which credential, and when. Open Brain serves every boot,
-- so this record is complete — "handed to", never "used", because injection is
-- all it can honestly see.
CREATE TABLE IF NOT EXISTS "connection_injections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "connections"("id") ON DELETE cascade,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE cascade,
  "via" text DEFAULT 'open' NOT NULL,
  "injected_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_injections_connection_idx" ON "connection_injections" ("connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_injections_user_idx" ON "connection_injections" ("user_id");

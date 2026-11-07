-- A secret was only ever a connection with no endpoint. One table, four kinds.
ALTER TABLE "secrets" RENAME TO "connections";
--> statement-breakpoint
ALTER TABLE "secret_grants" RENAME TO "connection_grants";
--> statement-breakpoint
ALTER TABLE "connection_grants" RENAME COLUMN "secret_id" TO "connection_id";
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'secret';
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "endpoint" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "auth_scheme" text NOT NULL DEFAULT 'bearer';
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "auth_param" text NOT NULL DEFAULT 'Authorization';
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER INDEX IF EXISTS "secrets_user_idx" RENAME TO "connections_user_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "secrets_user_name_idx" RENAME TO "connections_user_name_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "secret_grants_pair_idx" RENAME TO "connection_grants_pair_idx";

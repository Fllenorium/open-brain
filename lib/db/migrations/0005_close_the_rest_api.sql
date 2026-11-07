-- Open Brain talks to Postgres directly, as the owner of these tables, and never
-- through a hosted REST layer. Some hosts (Supabase) put one over every table in
-- `public` by default, reachable with a key that is designed to be public. With
-- row level security on and no policies, that layer sees nothing, while the
-- table owner — the app — is unaffected.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entry_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entry_reads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_bindings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "import_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "connection_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "connection_injections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "data_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "__openbrain_migrations" ENABLE ROW LEVEL SECURITY;

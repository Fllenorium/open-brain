-- An agent the owner has made a reviewer can accept and reject other agents'
-- proposals from wherever the owner talks to it, so reviewing doesn't mean
-- opening the app. Off unless the owner turns it on, and an agent can never
-- decide on its own proposals.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "can_review" boolean DEFAULT false NOT NULL;

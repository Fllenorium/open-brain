-- brain.search is grep, not retrieval: Postgres full-text plus substring.
-- No embeddings, no chunking, no ranking model. ARCHITECTURE.md §4.
CREATE INDEX IF NOT EXISTS entries_fts_idx ON entries USING GIN (
  to_tsvector(
    'english',
    coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(body, '')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS entries_path_trgm_idx ON entries (path text_pattern_ops);

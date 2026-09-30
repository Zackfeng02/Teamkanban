CREATE ROLE kanban_quotes_app LOGIN PASSWORD '<GENERATE_SECURE_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA kanban_private;
REVOKE ALL ON SCHEMA kanban_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA kanban_private TO kanban_quotes_app;
CREATE TABLE kanban_private.insurance_profiles (
 team_id text NOT NULL,
 id text NOT NULL,
 data jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 created_by text NOT NULL,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(team_id,id)
);
ALTER TABLE kanban_private.insurance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_private.insurance_profiles FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON kanban_private.insurance_profiles TO kanban_quotes_app;
CREATE POLICY team_profiles ON kanban_private.insurance_profiles TO kanban_quotes_app
USING (team_id = current_setting('kanban.team_id',true))
WITH CHECK (team_id = current_setting('kanban.team_id',true));

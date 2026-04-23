-- Allow browser/server anon clients to access project branch tables.

ALTER TABLE project_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project-branches public read"
  ON project_branches;
CREATE POLICY "project-branches public read"
  ON project_branches
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "project-branches public insert"
  ON project_branches;
CREATE POLICY "project-branches public insert"
  ON project_branches
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "project-branches public update"
  ON project_branches;
CREATE POLICY "project-branches public update"
  ON project_branches
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "project-branches public delete"
  ON project_branches;
CREATE POLICY "project-branches public delete"
  ON project_branches
  FOR DELETE
  USING (true);

ALTER TABLE project_branch_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project-branch-merges public read"
  ON project_branch_merges;
CREATE POLICY "project-branch-merges public read"
  ON project_branch_merges
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "project-branch-merges public insert"
  ON project_branch_merges;
CREATE POLICY "project-branch-merges public insert"
  ON project_branch_merges
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "project-branch-merges public delete"
  ON project_branch_merges;
CREATE POLICY "project-branch-merges public delete"
  ON project_branch_merges
  FOR DELETE
  USING (true);

-- 0074 — Organization Hub package keys
--
-- New enum values must be committed before they can be used (a value added in
-- a transaction is not usable inside it), so the packages arrive here and the
-- Hub itself follows in 0075.
--
-- Four packages, not fifteen add-ons (CLAUDE.md rule 18):
--   hubCore        Home, People, Departments, My Work, Knowledge, Announcements, Files, Tools
--   hubOperations  Calendar, Requests & Approvals, Forms, Department workspaces, Dashboards
--   hubPerformance KPIs, Scorecards, Goals, Training, Productivity, End of Day, Coaching
--   hubAi          Company assistant, Knowledge search, SOP questions (usage metered)
alter type public.product_key add value if not exists 'hubCore';
alter type public.product_key add value if not exists 'hubOperations';
alter type public.product_key add value if not exists 'hubPerformance';
alter type public.product_key add value if not exists 'hubAi';

-- Recovery data is available to the table owner and privileged database admins.
-- No application or anonymous database role receives a row-access policy.
ALTER TABLE "gps_simulation_cleanup_backups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "gps_simulation_cleanup_backups" FROM PUBLIC;

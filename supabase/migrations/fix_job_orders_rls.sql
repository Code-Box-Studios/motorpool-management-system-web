-- Enable RLS on job_orders table if not already enabled
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "job_orders_select_policy" ON job_orders;
DROP POLICY IF EXISTS "job_orders_insert_policy" ON job_orders;
DROP POLICY IF EXISTS "job_orders_update_policy" ON job_orders;
DROP POLICY IF EXISTS "job_orders_delete_policy" ON job_orders;

-- Create select policy: Allow users to see job orders
-- EVP Operations can see all job orders
-- Admins can see all job orders
-- Other users can only see job orders from their branch
CREATE POLICY "job_orders_select_policy" ON job_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.id = auth.uid()
      AND (
        r.name = 'evp_operations'
        OR r.name = 'admin'
        OR up.branch_id = job_orders.branch_id
      )
    )
  );

-- Create insert policy: Allow admins to create job orders
CREATE POLICY "job_orders_insert_policy" ON job_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.id = auth.uid()
      AND r.name = 'admin'
    )
  );

-- Create update policy: Allow admins and EVP operations to update job orders
CREATE POLICY "job_orders_update_policy" ON job_orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.id = auth.uid()
      AND (r.name = 'admin' OR r.name = 'evp_operations')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.id = auth.uid()
      AND (r.name = 'admin' OR r.name = 'evp_operations')
    )
  );

-- Create delete policy: Only admins can delete job orders
CREATE POLICY "job_orders_delete_policy" ON job_orders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.id = auth.uid()
      AND r.name = 'admin'
    )
  );

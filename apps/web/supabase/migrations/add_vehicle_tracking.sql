-- Add location tracking fields to vehicles table
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMP WITH TIME ZONE;

-- Create index for faster location queries
CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add comment to document the columns
COMMENT ON COLUMN vehicles.latitude IS 'Vehicle latitude coordinate for GPS tracking';
COMMENT ON COLUMN vehicles.longitude IS 'Vehicle longitude coordinate for GPS tracking';
COMMENT ON COLUMN vehicles.last_location_update IS 'Timestamp of the last location update';

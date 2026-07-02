// supabase/functions/gps-ingest/index.ts
//
// Supabase Edge Function for IoT GPS data ingestion.
// Accepts HTTP POST from Arduino/ESP32 devices and inserts GPS data
// into the gps_data table + updates the vehicle's location.
//
// Deploy with: supabase functions deploy gps-ingest
//
// Expected POST body (JSON):
// {
//   "vehicle_id": "uuid",
//   "latitude": 7.0731,
//   "longitude": 125.6128,
//   "speed": 45.2,
//   "heading": 90.0,
//   "engine_status": "on",
//   "api_key": "your-device-api-key"
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-device-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const {
      vehicle_id,
      latitude,
      longitude,
      speed,
      heading,
      engine_status,
      api_key,
      trip_id
    } = body;

    // Validate required fields
    if (!vehicle_id || latitude == null || longitude == null) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: vehicle_id, latitude, longitude'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate API key from request body or header
    const deviceApiKey =
      api_key || req.headers.get('x-device-api-key');
    const expectedApiKey = Deno.env.get('GPS_DEVICE_API_KEY');

    if (expectedApiKey && deviceApiKey !== expectedApiKey) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create Supabase client with service role key for server-side operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert GPS data
    const { data: gpsData, error: gpsError } = await supabase
      .from('gps_data')
      .insert({
        vehicle_id,
        trip_id: trip_id || null,
        latitude,
        longitude,
        speed: speed ?? null,
        heading: heading ?? null,
        engine_status: engine_status ?? null
      })
      .select()
      .single();

    if (gpsError) {
      console.error('GPS insert error:', gpsError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert GPS data', details: gpsError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update vehicle location
    const { error: vehicleError } = await supabase
      .from('vehicles')
      .update({
        latitude,
        longitude,
        last_location_update: new Date().toISOString()
      })
      .eq('id', vehicle_id);

    if (vehicleError) {
      console.error('Vehicle location update error:', vehicleError);
      // Non-fatal: GPS data was still recorded
    }

    return new Response(
      JSON.stringify({
        success: true,
        gps_id: gpsData.gps_id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('GPS ingest error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

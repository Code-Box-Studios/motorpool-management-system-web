import StatusBadge from '@/components/shared/status-badge';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});

const createVehicleIcon = (status: string, speed?: number) => {
  const colors: Record<string, string> = {
    available: 'green',
    on_trip: 'blue',
    under_maintenance: 'orange',
    out_of_service: 'red',
    to_be_repaired: 'purple'
  };

  const color = colors[status] || 'gray';
  const isMoving = speed && speed > 0;

  return L.divIcon({
    className: 'custom-vehicle-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        ${isMoving ? 'animation: pulse 1.5s infinite;' : ''}
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
        </svg>
        ${speed !== undefined ? `<div style="position: absolute; bottom: -20px; background: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; color: ${color}; white-space: nowrap;">${Math.round(speed)} km/h</div>` : ''}
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      </style>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
};

export interface GpsDataWithVehicle {
  gps_id: string;
  vehicle_id: string | null;
  trip_id: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engine_status: string | null;
  created_at: string;
  vehicles?: {
    id: string;
    make: string;
    model: string;
    license_plate: string;
    status: string;
    mileage: number;
    fuel_type: string;
  } | null;
}

interface VehicleMapProps {
  gpsData: GpsDataWithVehicle[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  showTrails?: boolean;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);

  return null;
}

export function VehicleMap({
  gpsData,
  center = [7.0731, 125.6128],
  zoom = 13,
  height = '500px'
}: VehicleMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);

  const validGpsData = gpsData.filter(
    (data) => data.latitude && data.longitude && data.vehicles
  );

  useEffect(() => {
    if (validGpsData.length > 0) {
      const firstData = validGpsData[0];
      if (firstData.latitude && firstData.longitude) {
        setMapCenter([firstData.latitude, firstData.longitude]);
      }
    }
  }, [validGpsData]);

  if (validGpsData.length === 0) {
    return (
      <div
        style={{
          height,
          width: '100%',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0f0f0',
          color: '#666'
        }}
      >
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <p style={{ marginBottom: '8px', fontWeight: 'bold' }}>
            No vehicle GPS data available
          </p>
          <p style={{ fontSize: '14px' }}>
            Vehicle tracking will appear here once GPS data is received
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden' }}
    >
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={mapCenter} />

        {validGpsData.map((data) => {
          const vehicle = data.vehicles!;
          return (
            <Marker
              key={data.gps_id}
              position={[data.latitude!, data.longitude!]}
              icon={createVehicleIcon(vehicle.status, data.speed || undefined)}
            >
              <Popup>
                <div style={{ minWidth: '250px' }}>
                  <h3 style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                    {vehicle.make} {vehicle.model}
                  </h3>
                  <p style={{ margin: '4px 0' }}>
                    <strong>License Plate:</strong> {vehicle.license_plate}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Status:</strong> <StatusBadge status={vehicle.status} />
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Mileage:</strong> {vehicle.mileage} km
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Speed:</strong>{' '}
                    {data.speed ? `${Math.round(data.speed)} km/h` : 'Stopped'}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Engine:</strong>{' '}
                    <span
                      style={{
                        color: data.engine_status === 'on' ? 'green' : 'red',
                        fontWeight: 'bold'
                      }}
                    >
                      {data.engine_status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Heading:</strong>{' '}
                    {data.heading ? `${Math.round(data.heading)}°` : 'N/A'}
                  </p>
                  <p
                    style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}
                  >
                    Last update: {new Date(data.created_at).toLocaleString()}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default VehicleMap;

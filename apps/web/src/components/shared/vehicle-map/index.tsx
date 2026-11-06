import { Badge } from '@/components/ui/badge';
import { resolveStatus } from '@/lib/status';
import { useEffect, useMemo, useRef } from 'react';
import type { Marker as LeafletMarker } from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  useMap
} from 'react-leaflet';
import { DEVICE_ONLINE_THRESHOLD_MS } from '@/lib/utils/tracker-devices';
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

const createVehicleIcon = (
  status: string,
  speed?: number,
  trackingColor?: string
) => {
  const colors: Record<string, string> = {
    available: 'green',
    on_trip: 'blue',
    under_maintenance: 'orange',
    out_of_service: 'red',
    to_be_repaired: 'purple'
  };

  const color = trackingColor ?? colors[status] ?? 'gray';

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
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
        </svg>
        ${speed !== undefined ? `<div style="position: absolute; bottom: -20px; background: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; color: ${color}; white-space: nowrap;">${Math.round(speed)} km/h</div>` : ''}
      </div>
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
  zoom?: number;
  /** The map height from `md` up. Below that it is capped to the viewport. */
  height?: string;
  showTrails?: boolean;
  selectedVehicleId?: string | null;
  onSelectedVehicleIdChange?: (vehicleId: string | null) => void;
  /** Explicit viewport requests; normal data polling preserves the operator's view. */
  focusRequest?: number;
  fitRequest?: number;
  /** Plate labels and position freshness colors; details are outside the map. */
  dashboardPresentation?: boolean;
  trackerConnections?: Record<string, 'online' | 'offline' | 'unknown'>;
}

// `height` is a fixed pixel value, which a phone in landscape (~375px of
// viewport) cannot afford. Capping with max-height rather than overriding
// height keeps this a ceiling, so a caller asking for a shorter map still
// gets one.
const VIEWPORT_HEIGHT_CAP = 'max-h-[min(360px,60vh)] md:max-h-none';

function MapUpdater({
  points,
  selectedVehicleId,
  focusRequest,
  fitRequest
}: {
  points: GpsDataWithVehicle[];
  selectedVehicleId: string | null;
  focusRequest: number;
  fitRequest: number;
}) {
  const map = useMap();
  const previous = useRef<{
    ids: string;
    selected: string | null;
    focus: number;
    fit: number;
  } | null>(null);

  useEffect(() => {
    const ids = points
      .map((p) => p.vehicles!.id)
      .sort()
      .join(',');
    const before = previous.current;
    const fit = !before || before.fit !== fitRequest || before.ids !== ids;
    const focus =
      !before ||
      before.selected !== selectedVehicleId ||
      before.focus !== focusRequest;
    previous.current = {
      ids,
      selected: selectedVehicleId,
      focus: focusRequest,
      fit: fitRequest
    };
    const selected = points.find((p) => p.vehicles?.id === selectedVehicleId);
    if (focus && selected) {
      map.setView([selected.latitude!, selected.longitude!], 16);
    } else if (fit && points.length) {
      map.closePopup();
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.latitude!, p.longitude!])),
        { padding: [48, 48], maxZoom: 15 }
      );
    }
  }, [points, selectedVehicleId, focusRequest, fitRequest, map]);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

// Touch devices and phone-width viewports. Not the `md` breakpoint alone:
// a phone in landscape is ~812px wide and still needs this.
const COARSE_POINTER_QUERY = '(pointer: coarse), (max-width: 767px)';

// With one-finger drag on, a vertical swipe anywhere over the map pans the map
// instead of scrolling the page, leaving only the card's padding to scroll past
// the map at all. Turning dragging off drops Leaflet's `leaflet-touch-drag`
// class, so `touch-action` falls back to `pan-x pan-y` and the browser gets the
// swipe back — two-finger gestures still pan and zoom via the pinch handler.
// This runs as a child rather than a MapContainer prop because MapContainer
// only reads its options once, on mount.
function SingleFingerDragToggle() {
  const map = useMap();

  useEffect(() => {
    const mql = window.matchMedia(COARSE_POINTER_QUERY);
    const apply = () => {
      if (mql.matches) {
        map.dragging.disable();
      } else {
        map.dragging.enable();
      }
    };

    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [map]);

  return null;
}

export function VehicleMap({
  gpsData,
  zoom = 13,
  height = '500px',
  selectedVehicleId = null,
  onSelectedVehicleIdChange,
  focusRequest = 0,
  fitRequest = 0,
  dashboardPresentation = false,
  trackerConnections
}: VehicleMapProps) {
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});

  const validGpsData = useMemo(
    () =>
      gpsData.filter(
        (data) =>
          data.latitude !== null &&
          data.longitude !== null &&
          Number.isFinite(data.latitude) &&
          Number.isFinite(data.longitude) &&
          Math.abs(data.latitude) <= 90 &&
          Math.abs(data.longitude) <= 180 &&
          data.vehicles
      ),
    [gpsData]
  );

  useEffect(() => {
    if (!selectedVehicleId || dashboardPresentation) return;
    markerRefs.current[selectedVehicleId]?.openPopup();
  }, [selectedVehicleId, focusRequest, dashboardPresentation]);

  if (validGpsData.length === 0) {
    return (
      <div
        className={`${VIEWPORT_HEIGHT_CAP} bg-muted text-muted-foreground`}
        style={{
          height,
          width: '100%',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
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

  const firstPoint = validGpsData[0];
  const currentCenter: [number, number] = [
    firstPoint.latitude!,
    firstPoint.longitude!
  ];

  return (
    <div
      className={VIEWPORT_HEIGHT_CAP}
      style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden' }}
    >
      <MapContainer
        center={currentCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={!dashboardPresentation}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater
          points={validGpsData}
          selectedVehicleId={selectedVehicleId}
          focusRequest={focusRequest}
          fitRequest={fitRequest}
        />
        <SingleFingerDragToggle />

        {validGpsData.map((data) => {
          const vehicle = data.vehicles!;
          const fresh =
            Number.isFinite(Date.parse(data.created_at)) &&
            Date.now() - Date.parse(data.created_at) <
              DEVICE_ONLINE_THRESHOLD_MS;
          const trackingColor = !fresh
            ? '#64748b'
            : data.speed === null
              ? '#64748b'
              : data.speed > 0
                ? '#059669'
                : '#2563eb';
          const connection = trackerConnections?.[vehicle.id] ?? 'unknown';
          const availability = resolveStatus(vehicle.status);
          return (
            <Marker
              key={vehicle.id}
              title={vehicle.license_plate}
              alt={vehicle.license_plate}
              position={[data.latitude!, data.longitude!]}
              icon={createVehicleIcon(
                vehicle.status,
                dashboardPresentation || !fresh
                  ? undefined
                  : (data.speed ?? undefined),
                trackingColor
              )}
              ref={(marker) => {
                markerRefs.current[vehicle.id] = marker;
              }}
              eventHandlers={{
                click: () => onSelectedVehicleIdChange?.(vehicle.id)
              }}
            >
              {dashboardPresentation ? (
                <Tooltip permanent direction="bottom" offset={[0, 20]}>
                  <span className="font-semibold">{vehicle.license_plate}</span>
                </Tooltip>
              ) : (
                <Popup>
                  <div style={{ minWidth: '250px' }}>
                    <h3 style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                      {vehicle.make} {vehicle.model}
                    </h3>
                    <p style={{ margin: '4px 0' }}>
                      <strong>License Plate:</strong> {vehicle.license_plate}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Tracker connection:</strong>{' '}
                      {connection === 'online'
                        ? 'Online'
                        : connection === 'offline'
                          ? 'Offline'
                          : 'Unknown'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Booking availability:</strong>{' '}
                      <Badge variant={availability.tone}>
                        {vehicle.status === 'available'
                          ? 'Available for booking'
                          : availability.label}
                      </Badge>
                    </p>
                    {!fresh && (
                      <p
                        style={{
                          margin: '10px 0',
                          padding: '8px',
                          borderRadius: '6px',
                          background: '#f1e7cf',
                          color: '#6c5014',
                          fontSize: '12px'
                        }}
                      >
                        <strong>Last known position.</strong> No recent GPS
                        update. Readings below are from the recorded position.
                      </p>
                    )}
                    <p style={{ margin: '4px 0' }}>
                      <strong>
                        {fresh ? 'Reported speed:' : 'Last reported speed:'}
                      </strong>{' '}
                      {data.speed !== null
                        ? `${Math.round(data.speed)} km/h`
                        : 'Unknown'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>
                        {fresh
                          ? 'Reported ignition:'
                          : 'Last reported ignition:'}
                      </strong>{' '}
                      <span
                        style={{
                          color:
                            data.engine_status === 'on'
                              ? 'green'
                              : data.engine_status === 'off'
                                ? '#555'
                                : '#666',
                          fontWeight: 'bold'
                        }}
                      >
                        {data.engine_status === 'on' ||
                        data.engine_status === 'off'
                          ? data.engine_status.toUpperCase()
                          : 'Unknown'}
                      </span>
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>
                        {fresh ? 'Reported heading:' : 'Last reported heading:'}
                      </strong>{' '}
                      {data.heading !== null
                        ? `${Math.round(data.heading)}°`
                        : 'Unknown'}
                    </p>
                    <p
                      style={{
                        margin: '4px 0',
                        fontSize: '12px',
                        color: '#666'
                      }}
                    >
                      Position recorded:{' '}
                      {new Date(data.created_at).toLocaleString()}
                    </p>
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default VehicleMap;

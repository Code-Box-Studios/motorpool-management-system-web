import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Loader2, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Leaflet's default marker resolves its images relative to the CSS, which a
// bundler rewrites — the same fix the fleet map already carries.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});

// Mindanao, and only Mindanao. The bounding box covers the island plus the
// Sulu archipelago (Basilan, Sulu, Tawi-Tawi), which are administratively part
// of it — a motorpool in Davao is not booking a trip to Luzon.
//
// bbox is a filter in Photon, not a bias, so results genuinely cannot fall
// outside it. The north-west corner of the box does clip a sliver of southern
// Palawan, which is Region IV-B and not Mindanao, so that is dropped by name.
const MINDANAO_BBOX = '119.0,4.4,126.8,10.3'; // minLon,minLat,maxLon,maxLat
const MINDANAO_CENTER: [number, number] = [7.8, 124.5];
const NOT_MINDANAO = ['palawan', 'mimaropa'];

// Photon (photon.komoot.io) is OpenStreetMap data served by an endpoint built
// for search-as-you-type: free, no key, CORS open. Nominatim — the other obvious
// choice — forbids autocomplete in its usage policy, so it is the wrong tool
// here. Both are community-run: debounce, keep the queries few, and if this ever
// carries real traffic, self-host Photon rather than lean on theirs.
const PHOTON = 'https://photon.komoot.io/api/';

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_key?: string;
  };
}

// "Ateneo de Davao University, Davao City, Davao del Sur" — the name, then just
// enough around it to tell two identically-named barangays apart.
const describe = (f: PhotonFeature): string => {
  const p = f.properties;
  return [p.name, p.city ?? p.county, p.state]
    .filter((part, i, all) => part && all.indexOf(part) === i)
    .join(', ');
};

async function searchMindanao(
  query: string,
  signal: AbortSignal
): Promise<Place[]> {
  const url = `${PHOTON}?q=${encodeURIComponent(query)}&bbox=${MINDANAO_BBOX}&limit=6&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { features?: PhotonFeature[] };

  return (json.features ?? [])
    .filter((f) => {
      const p = f.properties;
      if (p.countrycode && p.countrycode !== 'PH') return false;
      const state = p.state?.toLowerCase() ?? '';
      return !NOT_MINDANAO.some((bad) => state.includes(bad));
    })
    .map((f) => ({
      label: describe(f),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0]
    }))
    .filter((place) => place.label.length > 0);
}

// The map does not re-mount when a place is picked, so it has to be told to move.
//
// It also has to be told its own size. Leaflet measures its container once, at
// init; inside a wizard step that is `display:none` it measures 0×0, and every
// projection from then on divides by that — `flyTo` threw
// "Invalid LatLng object: (NaN, NaN)" and took the whole form down with it. The
// ResizeObserver re-measures the moment the step is shown.
const Recenter = ({ place }: { place: Place | null }) => {
  const map = useMap();

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    map.invalidateSize();
    const { x, y } = map.getSize();
    if (x === 0 || y === 0) return; // still hidden; the observer will come back
    if (place) map.setView([place.lat, place.lon], 14, { animate: true });
    else map.setView(MINDANAO_CENTER, 6);
  }, [place, map]);

  return null;
};

interface DestinationPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired with the coordinates when a searched place is chosen. */
  onPlace?: (place: Place | null) => void;
  invalid?: boolean;
  id?: string;
}

const DestinationPicker = ({
  value,
  onChange,
  onPlace,
  invalid,
  id = 'destination'
}: DestinationPickerProps) => {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Place | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Do not build a map inside a hidden wizard step: Leaflet would measure its
  // container at 0×0 and never recover. Mount it the first time it is on screen.
  const mapSlotRef = useRef<HTMLDivElement>(null);
  const [mapVisible, setMapVisible] = useState(false);
  useEffect(() => {
    const el = mapSlotRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setMapVisible(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Search-as-you-type, but not on every keystroke: Photon is a community
  // service and this is one field, not a firehose.
  useEffect(() => {
    const query = value.trim();
    if (query.length < 3 || picked?.label === query) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      searchMindanao(query, controller.signal)
        .then((places) => {
          setResults(places);
          setOpen(true);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          // A destination is a free-text field. If the search is down you type
          // the place and carry on — it must never block the request.
          setError(
            'Search is unavailable. You can still type the destination.'
          );
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, picked]);

  // Click-away closes the suggestions.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choose = (place: Place) => {
    setPicked(place);
    onChange(place.label);
    onPlace?.(place);
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={boxRef} className="relative">
        <Input
          id={id}
          value={value}
          autoComplete="off"
          aria-invalid={invalid}
          placeholder="Search a place in Mindanao, or type it"
          onChange={(e) => {
            onChange(e.target.value);
            setPicked(null);
            onPlace?.(null);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="pr-10"
        />
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </span>

        {open && results.length > 0 && (
          <ul
            role="listbox"
            className="bg-popover border-border absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-[20px] border p-1 shadow-lg"
          >
            {results.map((place) => (
              <li key={`${place.lat},${place.lon}`}>
                <button
                  type="button"
                  onClick={() => choose(place)}
                  className="hover:bg-accent flex w-full items-start gap-2 rounded-[16px] px-3 py-2 text-left text-sm transition-colors"
                >
                  <MapPin className="text-muted-foreground mt-0.5 size-4 flex-none" />
                  <span>{place.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-muted-foreground text-xs">{error}</p>}

      <div
        ref={mapSlotRef}
        className={cn(
          'border-border bg-muted h-48 overflow-hidden rounded-[20px] border'
        )}
      >
        {mapVisible && (
          <MapContainer
            center={MINDANAO_CENTER}
            zoom={6}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Recenter place={picked} />
            {picked && <Marker position={[picked.lat, picked.lon]} />}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default DestinationPicker;

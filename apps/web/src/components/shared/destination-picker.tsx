import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import { Loader2, Map, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

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
  /** Confirmed coordinates, cleared when the destination is edited as text. */
  onPlace?: (place: Place | null) => void;
  place?: Place | null;
  invalid?: boolean;
  id?: string;
}

const DestinationPicker = ({
  value,
  onChange,
  onPlace,
  place,
  invalid,
  id = 'destination'
}: DestinationPickerProps) => {
  const [mapOpen, setMapOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Place | null>(null);
  const [draft, setDraft] = useState<Place | null>(null);
  const [focusPlace, setFocusPlace] = useState<Place | null>(null);
  const [searched, setSearched] = useState(false);
  const resultsId = useId();
  const confirmed = place === undefined ? picked : place;
  const currentQuery = mapOpen ? query : value;
  const selectedLabel = mapOpen ? draft?.label : confirmed?.label;
  const showResults = suggestionsOpen && searchFocused && results.length > 0;

  const changeOpen = (next: boolean) => {
    if (next) {
      setDraft(confirmed);
      setFocusPlace(confirmed);
      setQuery(value);
      setResults([]);
      setSuggestionsOpen(false);
      setError('');
      setSearched(false);
    }
    setMapOpen(next);
  };

  // Search-as-you-type, but not on every keystroke: Photon is a community
  // service and this is one field, not a firehose.
  useEffect(() => {
    const term = currentQuery.trim();
    setResults([]);
    setActiveIndex(-1);
    setSearched(false);
    setError('');
    if (term.length < 3 || selectedLabel === term) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      searchMindanao(term, controller.signal)
        .then((places) => {
          if (controller.signal.aborted) return;
          setResults(places);
          setSuggestionsOpen(true);
          setSearched(true);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setError(
            mapOpen
              ? 'Search is unavailable. Click the map to place a pin, or enter the destination in the form.'
              : 'Search is unavailable. You can still enter a destination or choose it on the map.'
          );
          setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [currentQuery, mapOpen, selectedLabel]);

  const choose = (place: Place) => {
    if (mapOpen) {
      setDraft(place);
      setFocusPlace(place);
      setQuery(place.label);
    } else {
      setPicked(place);
      onChange(place.label);
      onPlace?.(place);
    }
    setSuggestionsOpen(false);
    setResults([]);
  };

  const movePin = (lat: number, lon: number) => {
    setDraft((current) => ({
      label: current?.label || query.trim() || 'Pinned location',
      lat,
      lon
    }));
    setSuggestionsOpen(false);
  };

  const confirm = () => {
    if (!draft) return;
    setPicked(draft);
    onChange(draft.label);
    onPlace?.(draft);
    setMapOpen(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      setSuggestionsOpen(true);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) =>
        index < 0
          ? direction === 1
            ? 0
            : results.length - 1
          : (index + direction + results.length) % results.length
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (showResults && results[activeIndex]) choose(results[activeIndex]);
    } else if (event.key === 'Escape' && suggestionsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setSuggestionsOpen(false);
    }
  };

  const suggestions = showResults && (
    <ul
      id={resultsId}
      role="listbox"
      aria-label="Destination search results"
      className="bg-popover border-border absolute z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-[20px] border p-1 shadow-lg"
    >
      {results.map((result, index) => (
        <li
          key={`${result.lat},${result.lon}`}
          id={`${resultsId}-${index}`}
          role="option"
          aria-selected={activeIndex === index}
        >
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(result)}
            data-active={activeIndex === index}
            className="hover:bg-accent data-[active=true]:bg-accent flex w-full items-start gap-2 rounded-[16px] px-3 py-2 text-left text-sm"
          >
            <MapPin className="text-muted-foreground mt-0.5 size-4 flex-none" />
            {result.label}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <Dialog open={mapOpen} onOpenChange={changeOpen}>
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Input
              id={id}
              value={value}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={!mapOpen && showResults}
              aria-controls={resultsId}
              aria-activedescendant={
                !mapOpen && showResults && activeIndex >= 0
                  ? `${resultsId}-${activeIndex}`
                  : undefined
              }
              aria-invalid={invalid}
              placeholder="Search a place or enter a destination"
              onChange={(e) => {
                onChange(e.target.value);
                setPicked(null);
                onPlace?.(null);
              }}
              onFocus={() => {
                setSearchFocused(true);
                setSuggestionsOpen(results.length > 0);
              }}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={handleSearchKeyDown}
              className="pr-10"
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
              {loading && !mapOpen ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </span>
            {!mapOpen && suggestions}
          </div>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              <Map className="size-4" />
              Open map
            </Button>
          </DialogTrigger>
        </div>
        {!mapOpen && error && (
          <p role="status" className="text-muted-foreground text-xs">
            {error}
          </p>
        )}
        {!mapOpen &&
          searchFocused &&
          searched &&
          !loading &&
          !error &&
          results.length === 0 &&
          !confirmed && (
            <p role="status" className="text-muted-foreground text-xs">
              No places found. Enter a destination or choose a pin on the map.
            </p>
          )}
        {confirmed && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <MapPin className="size-3.5" />
            Pin selected · {confirmed.lat.toFixed(5)},{' '}
            {confirmed.lon.toFixed(5)}
          </p>
        )}
        <DialogContent
          className="h-[90dvh] gap-3 p-4 sm:max-w-5xl sm:p-6"
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.stopPropagation();
          }}
        >
          <DialogHeader>
            <DialogTitle>Choose destination</DialogTitle>
            <DialogDescription>
              Search for a place in Mindanao, then click the map or drag the pin
              to adjust it.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="-mr-0 flex flex-col gap-3 overflow-hidden pr-0">
            <div className="relative z-10">
              <Input
                aria-label="Search destination map"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showResults}
                aria-controls={resultsId}
                aria-activedescendant={
                  showResults && activeIndex >= 0
                    ? `${resultsId}-${activeIndex}`
                    : undefined
                }
                value={query}
                placeholder="Search a city, address or landmark"
                autoComplete="off"
                className="pr-10"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setDraft(null);
                }}
                onFocus={() => {
                  setSearchFocused(true);
                  setSuggestionsOpen(results.length > 0);
                }}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={handleSearchKeyDown}
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </span>
              {suggestions}
            </div>
            {error && (
              <p role="status" className="text-muted-foreground text-sm">
                {error}
              </p>
            )}
            {searched &&
              !loading &&
              !error &&
              results.length === 0 &&
              !draft && (
                <p role="status" className="text-muted-foreground text-sm">
                  No places found. Try another search or click the map to place
                  a pin.
                </p>
              )}
            <div
              role="region"
              aria-label="Destination map"
              className="border-border bg-muted relative z-0 min-h-[260px] flex-1 overflow-hidden rounded-[20px] border"
            >
              <MapContainer
                center={
                  confirmed ? [confirmed.lat, confirmed.lon] : MINDANAO_CENTER
                }
                zoom={confirmed ? 14 : 6}
                scrollWheelZoom
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Recenter place={focusPlace} />
                <MapPinEvents onMove={movePin} />
                {draft && (
                  <Marker
                    position={[draft.lat, draft.lon]}
                    draggable
                    eventHandlers={{
                      dragend: (event) => {
                        const position = (event.target as L.Marker).getLatLng();
                        movePin(position.lat, position.lng);
                      }
                    }}
                  />
                )}
              </MapContainer>
            </div>
            <div className="min-h-10 text-sm" aria-live="polite">
              {draft ? (
                <>
                  <p className="font-medium">{draft.label}</p>
                  <output
                    aria-label="Selected coordinates"
                    className="text-muted-foreground text-xs tabular-nums"
                  >
                    {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}
                  </output>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Choose a search result or click the map to place your
                  destination pin.
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!draft} onClick={confirm}>
              Use this destination
            </Button>
          </DialogFooter>
        </DialogContent>
      </div>
    </Dialog>
  );
};

const MapPinEvents = ({
  onMove
}: {
  onMove: (lat: number, lon: number) => void;
}) => {
  useMapEvents({
    click: ({ latlng }) => onMove(latlng.lat, latlng.lng)
  });
  return null;
};

export default DestinationPicker;

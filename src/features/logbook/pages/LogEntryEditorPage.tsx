import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Navigation as NavIcon,
  CloudSun,
  ChevronDown,
  ChevronUp,
  Camera,
  X,
  Save,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { db } from '../../../db/database';
import { useGeolocation } from '../../../hooks/useGeolocation';
import type { LogEntry, LogPhoto } from '../../../types/logbook';
import type { Trip } from '../../../types/navigation';
import type { CrewMember } from '../../../types/crew';

const ENTRY_TYPES: Array<LogEntry['entryType']> = [
  'regular',
  'departure',
  'arrival',
  'position-fix',
  'weather-change',
  'incident',
  'watch-change',
];

const ENTRY_TYPE_LABELS: Record<LogEntry['entryType'], string> = {
  regular: 'Regular',
  departure: 'Departure',
  arrival: 'Arrival',
  'position-fix': 'Position Fix',
  'weather-change': 'Weather Change',
  incident: 'Incident',
  'watch-change': 'Watch Change',
};

const SEA_STATES: Array<NonNullable<LogEntry['seaState']>> = [
  'calm',
  'smooth',
  'slight',
  'moderate',
  'rough',
  'very-rough',
];

const VISIBILITIES: Array<NonNullable<LogEntry['visibility']>> = ['good', 'moderate', 'poor', 'fog'];

const MAX_PHOTOS = 5;
const MAX_DIM = 800;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toLocalDateTimeInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(s: string): number {
  // Parse as local time
  return new Date(s).getTime();
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function LogEntryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tripIdFromUrl = searchParams.get('tripId') ?? '';
  const isEdit = Boolean(id);

  const geo = useGeolocation(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [timestampStr, setTimestampStr] = useState<string>(toLocalDateTimeInput(Date.now()));
  const [tripId, setTripId] = useState<string>('');
  const [entryType, setEntryType] = useState<LogEntry['entryType']>('regular');
  const [createdBy, setCreatedBy] = useState<string>('');
  const [createdByOther, setCreatedByOther] = useState<string>('');
  const [isOther, setIsOther] = useState(false);

  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [positionSource, setPositionSource] = useState<LogEntry['positionSource']>('manual');

  const [courseOverGround, setCourseOverGround] = useState<string>('');
  const [speedOverGround, setSpeedOverGround] = useState<string>('');
  const [heading, setHeading] = useState<string>('');
  const [engineHours, setEngineHours] = useState<string>('');
  const [engineRunning, setEngineRunning] = useState<boolean>(false);

  const [windSpeed, setWindSpeed] = useState<string>('');
  const [windDirection, setWindDirection] = useState<string>('');
  const [seaState, setSeaState] = useState<LogEntry['seaState'] | ''>('');
  const [visibility, setVisibility] = useState<LogEntry['visibility'] | ''>('');
  const [barometer, setBarometer] = useState<string>('');
  const [temperature, setTemperature] = useState<string>('');
  const [weatherNotes, setWeatherNotes] = useState<string>('');

  const [notes, setNotes] = useState<string>('');
  const [photos, setPhotos] = useState<LogPhoto[]>([]);

  useEffect(() => {
    (async () => {
      const [allTrips, allCrew] = await Promise.all([db.trips.toArray(), db.crewMembers.toArray()]);
      setTrips(allTrips);
      setCrew(allCrew);

      if (isEdit && id) {
        const e = await db.logEntries.get(id);
        if (!e) {
          setError('Log entry not found');
          setLoading(false);
          return;
        }
        setTimestampStr(toLocalDateTimeInput(e.timestamp));
        setTripId(e.tripId);
        setEntryType(e.entryType);
        setCreatedBy(e.createdBy ?? '');
        if (e.createdBy && !allCrew.find((c) => c.name === e.createdBy)) {
          setIsOther(true);
          setCreatedByOther(e.createdBy);
        }
        if (e.position) {
          setLat(e.position.lat.toString());
          setLng(e.position.lng.toString());
        }
        setPositionSource(e.positionSource);
        setCourseOverGround(e.courseOverGround?.toString() ?? '');
        setSpeedOverGround(e.speedOverGround?.toString() ?? '');
        setHeading(e.heading?.toString() ?? '');
        setEngineHours(e.engineHours?.toString() ?? '');
        setEngineRunning(e.engineRunning);
        setWindSpeed(e.windSpeed?.toString() ?? '');
        setWindDirection(e.windDirection?.toString() ?? '');
        setSeaState(e.seaState ?? '');
        setVisibility(e.visibility ?? '');
        setBarometer(e.barometer?.toString() ?? '');
        setTemperature(e.temperature?.toString() ?? '');
        setWeatherNotes(e.weatherNotes ?? '');
        setNotes(e.notes);
        setPhotos(e.photos ?? []);
        if (
          e.windSpeed !== undefined ||
          e.seaState ||
          e.visibility ||
          e.barometer !== undefined ||
          e.temperature !== undefined ||
          e.weatherNotes
        ) {
          setWeatherOpen(true);
        }
      } else {
        // Default to trip from URL or most recent active/planning
        let t: Trip | undefined;
        if (tripIdFromUrl) {
          t = allTrips.find((x) => x.id === tripIdFromUrl);
        }
        if (!t) {
          t = allTrips
            .filter((x) => x.status === 'active' || x.status === 'planning')
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        }
        if (t) setTripId(t.id);
      }
      setLoading(false);
    })();
  }, [id, isEdit, tripIdFromUrl]);

  const handleGetGps = () => {
    geo.refresh();
  };

  useEffect(() => {
    if (geo.position && !geo.loading) {
      // When user presses refresh successfully, auto-fill lat/lng
      // Only act on "fresh" position updates
      setLat(geo.position.lat.toFixed(6));
      setLng(geo.position.lng.toFixed(6));
      setPositionSource('gps');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position?.timestamp]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`Max ${MAX_PHOTOS} photos per entry.`);
      return;
    }
    const toProcess = Array.from(files).slice(0, remaining);
    try {
      const newPhotos: LogPhoto[] = [];
      for (const f of toProcess) {
        const dataUrl = await compressImage(f);
        newPhotos.push({
          id: makeId(),
          data: dataUrl,
          timestamp: Date.now(),
        });
      }
      setPhotos((p) => [...p, ...newPhotos]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process photos');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (pid: string) => {
    setPhotos((p) => p.filter((x) => x.id !== pid));
  };

  const updatePhotoCaption = (pid: string, caption: string) => {
    setPhotos((p) => p.map((x) => (x.id === pid ? { ...x, caption } : x)));
  };

  const displayLat = useMemo(() => {
    const n = Number(lat);
    if (!Number.isFinite(n) || !lat) return '';
    return `${Math.abs(n).toFixed(4)}°${n >= 0 ? 'N' : 'S'}`;
  }, [lat]);
  const displayLng = useMemo(() => {
    const n = Number(lng);
    if (!Number.isFinite(n) || !lng) return '';
    return `${Math.abs(n).toFixed(4)}°${n >= 0 ? 'E' : 'W'}`;
  }, [lng]);

  const handleSave = async () => {
    setError(null);
    if (!tripId) {
      setError('Trip is required');
      return;
    }
    if (!notes.trim()) {
      setError('Notes are required');
      return;
    }
    setSaving(true);
    try {
      const ts = fromLocalDateTimeInput(timestampStr);
      const hasPosition = lat !== '' && lng !== '' && !isNaN(Number(lat)) && !isNaN(Number(lng));

      const resolvedCreator = isOther ? createdByOther.trim() : createdBy;

      const entry: LogEntry = {
        id: id ?? makeId(),
        tripId,
        timestamp: ts,
        position: hasPosition
          ? {
              lat: Number(lat),
              lng: Number(lng),
              timestamp: ts,
            }
          : undefined,
        positionSource,
        courseOverGround: courseOverGround === '' ? undefined : Number(courseOverGround),
        speedOverGround: speedOverGround === '' ? undefined : Number(speedOverGround),
        heading: heading === '' ? undefined : Number(heading),
        engineHours: engineHours === '' ? undefined : Number(engineHours),
        engineRunning,
        windSpeed: windSpeed === '' ? undefined : Number(windSpeed),
        windDirection: windDirection === '' ? undefined : Number(windDirection),
        seaState: seaState === '' ? undefined : seaState,
        visibility: visibility === '' ? undefined : visibility,
        barometer: barometer === '' ? undefined : Number(barometer),
        temperature: temperature === '' ? undefined : Number(temperature),
        weatherNotes: weatherNotes || undefined,
        notes: notes.trim(),
        photos: photos.length > 0 ? photos : undefined,
        entryType,
        createdBy: resolvedCreator || undefined,
      };

      await db.logEntries.put(entry);
      navigate(`/planner/logbook/${entry.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/planner/logbook"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="flex-1 text-xl font-semibold">{isEdit ? 'Edit Log Entry' : 'New Log Entry'}</h2>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Section 1: Time & Trip */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Time & Trip
          </h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Timestamp</label>
              <input
                type="datetime-local"
                value={timestampStr}
                onChange={(e) => setTimestampStr(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Trip *</label>
              <select
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              >
                <option value="">Select trip…</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Entry Type</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as LogEntry['entryType'])}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ENTRY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Created By</label>
              <select
                value={isOther ? '__other__' : createdBy}
                onChange={(e) => {
                  if (e.target.value === '__other__') {
                    setIsOther(true);
                    setCreatedBy('');
                  } else {
                    setIsOther(false);
                    setCreatedBy(e.target.value);
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              >
                <option value="">— None —</option>
                {crew.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.role.replace('-', ' ')})
                  </option>
                ))}
                <option value="__other__">Other…</option>
              </select>
              {isOther && (
                <input
                  type="text"
                  value={createdByOther}
                  onChange={(e) => setCreatedByOther(e.target.value)}
                  placeholder="Name"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Position */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            <MapPin className="h-4 w-4" />
            Position
          </h3>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleGetGps}
              disabled={geo.loading}
              className="flex items-center justify-center gap-2 rounded-lg bg-sea-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sea-700 disabled:opacity-60"
            >
              {geo.loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Getting GPS…
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4" />
                  Get GPS
                </>
              )}
            </button>
            {geo.error && (
              <p className="text-xs text-red-400">GPS error: {geo.error}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => {
                    setLat(e.target.value);
                    setPositionSource('manual');
                  }}
                  placeholder="40.9055"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => {
                    setLng(e.target.value);
                    setPositionSource('manual');
                  }}
                  placeholder="-73.3565"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              </div>
            </div>
            {displayLat && displayLng && (
              <p className="text-xs text-sea-400">
                {displayLat}, {displayLng}
                <span className="ml-2 text-slate-500">({positionSource})</span>
              </p>
            )}
          </div>
        </section>

        {/* Section 3: Course & Speed */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            <NavIcon className="h-4 w-4" />
            Course & Speed
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">COG (°)</label>
              <input
                type="number"
                step="1"
                value={courseOverGround}
                onChange={(e) => setCourseOverGround(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">SOG (kt)</label>
              <input
                type="number"
                step="0.1"
                value={speedOverGround}
                onChange={(e) => setSpeedOverGround(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Heading (°)</label>
              <input
                type="number"
                step="1"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Engine hours</label>
              <input
                type="number"
                step="0.1"
                value={engineHours}
                onChange={(e) => setEngineHours(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={engineRunning}
              onChange={(e) => setEngineRunning(e.target.checked)}
              className="h-5 w-5 rounded border-slate-700 bg-slate-950 text-sea-500 focus:ring-sea-500"
            />
            <span className="text-sm text-slate-100">Engine running</span>
          </label>
        </section>

        {/* Section 4: Weather (collapsible) */}
        <section className="rounded-lg border border-slate-800 bg-slate-900">
          <button
            type="button"
            onClick={() => setWeatherOpen((v) => !v)}
            className="flex w-full items-center justify-between p-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <CloudSun className="h-4 w-4" />
              Weather
            </h3>
            {weatherOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {weatherOpen && (
            <div className="border-t border-slate-800 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Wind speed (kt)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={windSpeed}
                    onChange={(e) => setWindSpeed(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Wind direction (°)</label>
                  <input
                    type="number"
                    step="1"
                    value={windDirection}
                    onChange={(e) => setWindDirection(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Sea state</label>
                  <select
                    value={seaState}
                    onChange={(e) => setSeaState(e.target.value as LogEntry['seaState'] | '')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {SEA_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('-', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Visibility</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as LogEntry['visibility'] | '')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Barometer (inHg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={barometer}
                    onChange={(e) => setBarometer(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Temperature (°F)</label>
                  <input
                    type="number"
                    step="1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-slate-400">Weather notes</label>
                <textarea
                  value={weatherNotes}
                  onChange={(e) => setWeatherNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </section>

        {/* Section 5: Notes */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Notes *
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="What happened? Observations, decisions, crew changes…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
          />
        </section>

        {/* Section 6: Photos */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            <Camera className="h-4 w-4" />
            Photos ({photos.length}/{MAX_PHOTOS})
          </h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= MAX_PHOTOS}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950 py-4 text-sm text-slate-300 hover:border-sea-500 disabled:opacity-40"
          >
            <Camera className="h-4 w-4" />
            Add photo
          </button>
          {photos.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {photos.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                  <div className="relative">
                    <img
                      src={p.data}
                      alt=""
                      className="h-32 w-full rounded object-cover"
                    />
                    <button
                      onClick={() => removePhoto(p.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-red-500/80"
                      aria-label="Remove photo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={p.caption ?? ''}
                    onChange={(e) => updatePhotoCaption(p.id, e.target.value)}
                    placeholder="Caption"
                    className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-sea-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-slate-800 bg-slate-950/95 p-4 backdrop-blur">
          <Link
            to="/planner/logbook"
            className="flex-1 rounded-lg bg-slate-800 px-4 py-3 text-center text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sea-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sea-700 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

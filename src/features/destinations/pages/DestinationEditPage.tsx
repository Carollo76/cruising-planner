import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, Save, Locate, MapPin } from 'lucide-react';
import { NauticalMap } from '../../../components/map/NauticalMap';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import {
  fetchChartedDepths,
  sourceNoteFor,
  type ChartedDepths,
} from '../../../services/noaaChartDepths';
import type {
  Destination,
  DestinationType,
  Region,
  Amenities,
  MarinaDetails,
  AnchorageDetails,
  MooringDetails,
} from '../../../types/destination';

const DEFAULT_AMENITIES: Amenities = {
  fuel: false,
  water: false,
  electric: false,
  pumpout: false,
  showers: false,
  laundry: false,
  wifi: false,
  restaurant: false,
  groceries: false,
  repairs: false,
  dinghyDock: false,
  pool: false,
  ice: false,
  propane: false,
};

const AMENITY_LABELS: Array<[keyof Amenities, string]> = [
  ['fuel', 'Fuel'],
  ['water', 'Water'],
  ['electric', 'Electric'],
  ['pumpout', 'Pumpout'],
  ['showers', 'Showers'],
  ['laundry', 'Laundry'],
  ['wifi', 'WiFi'],
  ['restaurant', 'Restaurant'],
  ['groceries', 'Groceries'],
  ['repairs', 'Repairs'],
  ['dinghyDock', 'Dinghy Dock'],
  ['pool', 'Pool'],
  ['ice', 'Ice'],
  ['propane', 'Propane'],
];

const pinIcon = new L.DivIcon({
  className: '',
  html: '<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;border:3px solid #40c1d0;background:#40c1d0aa;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapClicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function DestinationEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const homePort = useSettingsStore((s) => s.homePort);
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [name, setName] = useState('');
  const [type, setType] = useState<DestinationType>('marina');
  const [region, setRegion] = useState<Region>('other');
  const [description, setDescription] = useState('');
  const [vhfChannel, setVhfChannel] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [lat, setLat] = useState(homePort.lat);
  const [lng, setLng] = useState(homePort.lng);
  const [amenities, setAmenities] = useState<Amenities>({ ...DEFAULT_AMENITIES });
  const [controllingDepth, setControllingDepth] = useState('');
  const [depthSource, setDepthSource] = useState('');
  const [charted, setCharted] = useState<ChartedDepths | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  /**
   * Looks the depths up; does not decide them.
   *
   * The shallowest sounding within a search radius is not a channel's controlling depth —
   * the radius takes in water beside the channel, and a boat does not sail over the shoal.
   * So the candidates are listed for the skipper to pick from, with survey dates, rather
   * than one being written into the field automatically.
   */
  const lookupCharted = async () => {
    setChartLoading(true);
    setChartError(null);
    try {
      setCharted(await fetchChartedDepths({ lat, lng }, 0.25));
    } catch (err) {
      setChartError((err as Error).message);
      setCharted(null);
    } finally {
      setChartLoading(false);
    }
  };

  // Marina
  const [slipCount, setSlipCount] = useState('');
  const [maxLOA, setMaxLOA] = useState('');
  const [maxDraft, setMaxDraft] = useState('');
  const [pricePerFoot, setPricePerFoot] = useState('');
  const [transientSlips, setTransientSlips] = useState(true);
  const [reservationRequired, setReservationRequired] = useState(false);

  // Anchorage
  const [holdingQuality, setHoldingQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('good');
  const [bottomType, setBottomType] = useState('mud');
  const [protectionFrom, setProtectionFrom] = useState('');
  const [exposedTo, setExposedTo] = useState('');
  const [typicalDepthFeet, setTypicalDepthFeet] = useState('10');
  const [swingRoomFeet, setSwingRoomFeet] = useState('');

  // Mooring
  const [mooringCount, setMooringCount] = useState('');
  const [pricePerNight, setPricePerNight] = useState('');
  const [launchService, setLaunchService] = useState(false);
  const [operator, setOperator] = useState('');
  const [isUserAdded, setIsUserAdded] = useState(true);
  const [createdAt, setCreatedAt] = useState(Date.now());

  useEffect(() => {
    if (!isNew && id) {
      db.destinations.get(id).then((d) => {
        if (d) {
          setName(d.name);
          setType(d.type);
          setRegion(d.region);
          setDescription(d.description ?? '');
          setVhfChannel(d.vhfChannel ?? '');
          setPhone(d.phone ?? '');
          setWebsite(d.website ?? '');
          setLat(d.position.lat);
          setLng(d.position.lng);
          setAmenities(d.amenities);
          setControllingDepth(d.entranceControllingDepthFt?.toString() ?? '');
          setDepthSource(d.depthSourceNote ?? '');
          setIsUserAdded(d.isUserAdded);
          setCreatedAt(d.createdAt);

          if (d.details.type === 'marina') {
            setSlipCount(d.details.slipCount?.toString() ?? '');
            setMaxLOA(d.details.maxLOA?.toString() ?? '');
            setMaxDraft(d.details.maxDraft?.toString() ?? '');
            setPricePerFoot(d.details.pricePerFoot?.toString() ?? '');
            setTransientSlips(d.details.transientSlips);
            setReservationRequired(d.details.reservationRequired);
          } else if (d.details.type === 'anchorage') {
            setHoldingQuality(d.details.holdingQuality);
            setBottomType(d.details.bottomType);
            setProtectionFrom(d.details.protectionFrom.join(', '));
            setExposedTo(d.details.exposedTo.join(', '));
            setTypicalDepthFeet(d.details.typicalDepthFeet.toString());
            setSwingRoomFeet(d.details.swingRoomFeet?.toString() ?? '');
          } else if (d.details.type === 'mooring') {
            setMooringCount(d.details.mooringCount?.toString() ?? '');
            setPricePerNight(d.details.pricePerNight?.toString() ?? '');
            setMaxLOA(d.details.maxLOA?.toString() ?? '');
            setLaunchService(d.details.launchService);
            setReservationRequired(d.details.reservationRequired);
            setOperator(d.details.operator ?? '');
          }
        }
        setLoading(false);
      });
    }
  }, [id, isNew]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      (err) => alert(`Could not get location: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const buildDetails = (): Destination['details'] => {
    if (type === 'anchorage') {
      const det: AnchorageDetails = {
        type: 'anchorage',
        holdingQuality,
        bottomType,
        protectionFrom: protectionFrom
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        exposedTo: exposedTo
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        typicalDepthFeet: parseFloat(typicalDepthFeet) || 0,
        swingRoomFeet: swingRoomFeet ? parseFloat(swingRoomFeet) : undefined,
      };
      return det;
    }
    if (type === 'mooring') {
      const det: MooringDetails = {
        type: 'mooring',
        mooringCount: mooringCount ? parseInt(mooringCount, 10) : undefined,
        pricePerNight: pricePerNight ? parseFloat(pricePerNight) : undefined,
        maxLOA: maxLOA ? parseFloat(maxLOA) : undefined,
        dinghyDock: amenities.dinghyDock,
        launchService,
        reservationRequired,
        operator: operator || undefined,
      };
      return det;
    }
    // marina / yacht-club / town-dock all use MarinaDetails shape
    const det: MarinaDetails = {
      type: 'marina',
      slipCount: slipCount ? parseInt(slipCount, 10) : undefined,
      maxLOA: maxLOA ? parseFloat(maxLOA) : undefined,
      maxDraft: maxDraft ? parseFloat(maxDraft) : undefined,
      pricePerFoot: pricePerFoot ? parseFloat(pricePerFoot) : undefined,
      transientSlips,
      reservationRequired,
    };
    return det;
  };

  const save = async () => {
    if (!name.trim()) {
      alert('Please enter a name');
      return;
    }
    const destId = isNew ? uuid() : id!;
    const now = Date.now();

    const existing = isNew ? null : await db.destinations.get(destId);

    const destination: Destination = {
      id: destId,
      name: name.trim(),
      type,
      region,
      position: { lat, lng },
      description: description.trim() || undefined,
      vhfChannel: vhfChannel.trim() || undefined,
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      amenities,
      // Left undefined when blank so the depth check says "unknown" rather than reading a
      // stray 0 as "no water".
      entranceControllingDepthFt:
        controllingDepth.trim() !== '' && Number.isFinite(Number(controllingDepth))
          ? Number(controllingDepth)
          : undefined,
      depthSourceNote: depthSource.trim() || undefined,
      details: buildDetails(),
      reviews: existing?.reviews ?? [],
      isUserAdded: isNew ? true : isUserAdded,
      createdAt: isNew ? now : createdAt,
      updatedAt: now,
    };

    await db.destinations.put(destination);
    navigate(`/planner/destinations/${destId}`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-800 bg-slate-900/95 p-3 backdrop-blur-sm">
        <button
          onClick={() => navigate(isNew ? '/planner/destinations' : `/planner/destinations/${id}`)}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-lg font-semibold">{isNew ? 'Add Place' : 'Edit Place'}</h2>
        <button
          onClick={save}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>

      <div className="space-y-5 p-4">
        {/* Basic info */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Basic Info
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Northport Yacht Club"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
              <div className="flex flex-wrap gap-2">
                {(['marina', 'anchorage', 'mooring', 'yacht-club', 'town-dock'] as DestinationType[]).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        type === t
                          ? 'bg-sea-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {t.replace('-', ' ')}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
              >
                <option value="new-england">New England / Long Island Sound</option>
                <option value="mid-atlantic">Mid-Atlantic</option>
                <option value="chesapeake">Chesapeake Bay</option>
                <option value="icw">ICW</option>
                <option value="florida">Florida</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's it like? What do you need to know?"
                className="w-full resize-none rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
              />
            </div>
          </div>
        </section>

        {/* Location */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Location
          </h3>
          <div className="mb-2 overflow-hidden rounded-lg border border-slate-800" style={{ height: 240 }}>
            <NauticalMap center={[lat, lng]} zoom={13}>
              <MapClicker onPick={(la, ln) => { setLat(la); setLng(ln); }} />
              <Marker position={[lat, lng]} icon={pinIcon} />
            </NauticalMap>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            <MapPin className="mr-1 inline h-3 w-3" />
            Tap the map to place the pin, or enter coordinates below
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Latitude</label>
              <input
                type="number"
                step="0.00001"
                value={lat}
                onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                className="w-full rounded bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Longitude</label>
              <input
                type="number"
                step="0.00001"
                value={lng}
                onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                className="w-full rounded bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            className="mt-2 flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Locate className="h-3.5 w-3.5" />
            Use My Location
          </button>
        </section>

        {/* Entrance depth — what decides whether the boat can get in */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Entrance Depth
          </h3>
          <p className="mb-2 text-xs text-slate-500">
            Least depth in the entrance channel at MLLW. Leave blank if you do not know it —
            the departure planner will say the depth is unknown rather than assume there is
            water. Take it from a chart or Coast Pilot, never an estimate.
          </p>
          <button
            type="button"
            onClick={lookupCharted}
            disabled={chartLoading}
            className="mb-3 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white hover:bg-sea-700 disabled:opacity-40"
          >
            {chartLoading ? 'Reading charts…' : 'Look up charted depths'}
          </button>

          {chartError && (
            <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {chartError}
            </p>
          )}

          {charted && (
            <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
              {charted.soundings.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No charted soundings within {charted.radiusNm.toFixed(2)} NM. Try the chart
                  directly — this harbour may only be covered at a coarser scale.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-slate-400">
                    {charted.soundings.length} charted soundings within{' '}
                    {charted.radiusNm.toFixed(2)} NM, shallowest first. Pick the one that
                    represents your approach — these include water beside the channel.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {charted.soundings.slice(0, 10).map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setControllingDepth(String(s.depthFt));
                          setDepthSource(
                            `NOAA ENC sounding${s.surveyedOn ? `, surveyed ${s.surveyedOn}` : ''}`
                          );
                        }}
                        title={`${s.distanceNm.toFixed(2)} NM away${s.surveyedOn ? `, surveyed ${s.surveyedOn}` : ''}`}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-100 hover:border-sea-500"
                      >
                        {s.depthFt.toFixed(1)} ft
                        <span className="ml-1 text-slate-500">
                          {s.surveyedOn ? s.surveyedOn.slice(0, 4) : '—'}
                        </span>
                      </button>
                    ))}
                  </div>
                  {charted.oldestSurvey && Number(charted.oldestSurvey.slice(0, 4)) < 2010 && (
                    <p className="mt-2 text-xs text-amber-400">
                      Some of these soundings date from {charted.oldestSurvey.slice(0, 4)}.
                      Harbours shoal between surveys — prefer the recent ones and treat old
                      figures as indicative.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">{sourceNoteFor(charted)}</p>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Controlling depth (ft, MLLW)
              </label>
              <input
                type="number"
                step="0.1"
                value={controllingDepth}
                onChange={(e) => setControllingDepth(e.target.value)}
                placeholder="e.g. 6"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Source</label>
              <input
                type="text"
                value={depthSource}
                onChange={(e) => setDepthSource(e.target.value)}
                placeholder="NOAA chart 12365, 2024"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
              />
            </div>
          </div>
        </section>

        {/* Contact */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Contact
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">VHF Channel</label>
              <input
                type="text"
                value={vhfChannel}
                onChange={(e) => setVhfChannel(e.target.value)}
                placeholder="16/09"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="631-555-0100"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-400">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>
        </section>

        {/* Type-specific details */}
        {(type === 'marina' || type === 'yacht-club' || type === 'town-dock') && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Marina Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Slip Count</label>
                <input type="number" value={slipCount} onChange={(e) => setSlipCount(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Price / ft / night</label>
                <input type="number" step="0.01" value={pricePerFoot} onChange={(e) => setPricePerFoot(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Max LOA (ft)</label>
                <input type="number" value={maxLOA} onChange={(e) => setMaxLOA(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Max Draft (ft)</label>
                <input type="number" step="0.1" value={maxDraft} onChange={(e) => setMaxDraft(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={transientSlips} onChange={(e) => setTransientSlips(e.target.checked)}
                  className="h-4 w-4 rounded bg-slate-800 accent-sea-500" />
                Transient slips
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={reservationRequired} onChange={(e) => setReservationRequired(e.target.checked)}
                  className="h-4 w-4 rounded bg-slate-800 accent-sea-500" />
                Reservation required
              </label>
            </div>
          </section>
        )}

        {type === 'anchorage' && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Anchorage Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Holding</label>
                <select value={holdingQuality} onChange={(e) => setHoldingQuality(e.target.value as any)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500">
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Bottom Type</label>
                <input type="text" value={bottomType} onChange={(e) => setBottomType(e.target.value)} placeholder="mud, sand, rock"
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Typical Depth (ft)</label>
                <input type="number" value={typicalDepthFeet} onChange={(e) => setTypicalDepthFeet(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Swing Room (ft)</label>
                <input type="number" value={swingRoomFeet} onChange={(e) => setSwingRoomFeet(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-400">Protection From (e.g. N, NE, E)</label>
                <input type="text" value={protectionFrom} onChange={(e) => setProtectionFrom(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-400">Exposed To</label>
                <input type="text" value={exposedTo} onChange={(e) => setExposedTo(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
            </div>
          </section>
        )}

        {type === 'mooring' && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Mooring Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Mooring Count</label>
                <input type="number" value={mooringCount} onChange={(e) => setMooringCount(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Price / Night ($)</label>
                <input type="number" step="0.01" value={pricePerNight} onChange={(e) => setPricePerNight(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Max LOA (ft)</label>
                <input type="number" value={maxLOA} onChange={(e) => setMaxLOA(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Operator</label>
                <input type="text" value={operator} onChange={(e) => setOperator(e.target.value)}
                  className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={launchService} onChange={(e) => setLaunchService(e.target.checked)}
                  className="h-4 w-4 rounded bg-slate-800 accent-sea-500" />
                Launch service
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={reservationRequired} onChange={(e) => setReservationRequired(e.target.checked)}
                  className="h-4 w-4 rounded bg-slate-800 accent-sea-500" />
                Reservation required
              </label>
            </div>
          </section>
        )}

        {/* Amenities */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Amenities
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AMENITY_LABELS.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:border-slate-700"
              >
                <input
                  type="checkbox"
                  checked={amenities[key]}
                  onChange={(e) => setAmenities((prev) => ({ ...prev, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded bg-slate-800 accent-sea-500"
                />
                {label}
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

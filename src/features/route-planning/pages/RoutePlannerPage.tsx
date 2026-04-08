import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Save, Anchor, Download, Upload, Droplets, Fuel, Clock, Navigation, ArrowLeft } from 'lucide-react';
import { NauticalMap } from '../../../components/map/NauticalMap';
import { WaypointEditor } from '../components/WaypointEditor';
import { DestinationPicker } from '../components/DestinationPicker';
import type { Waypoint, Route } from '../../../types/navigation';
import type { Destination } from '../../../types/destination';
import {
  distanceNM,
  bearingTrue,
  bearingMagnetic,
  etaHours,
  fuelConsumption,
  formatDistance,
  formatBearing,
  formatDuration,
} from '../../../utils/navigation-math';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import { downloadGPX, parseGPX } from '../utils/gpx';

const WAYPOINT_COLORS: Record<Waypoint['waypointType'], string> = {
  departure: '#22c55e',
  waypoint: '#40c1d0',
  destination: '#3b82f6',
  anchorage: '#f59e0b',
  hazard: '#ef4444',
};

function makeWaypointIcon(type: Waypoint['waypointType'], index: number, total: number): L.DivIcon {
  const color = WAYPOINT_COLORS[type];
  const label = index === 0 ? 'S' : index === total - 1 ? 'E' : String(index);
  return new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;border:2px solid ${color};background:${color}44;color:${color};font-size:10px;font-weight:700;">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

interface RoutePlannerPageProps {
  mode?: 'create' | 'edit';
}

export function RoutePlannerPage({ mode = 'create' }: RoutePlannerPageProps) {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tripIdParam = searchParams.get('tripId');
  const { boatConfig } = useSettingsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [routeName, setRouteName] = useState('');
  const [description, setDescription] = useState('');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [editingWaypoint, setEditingWaypoint] = useState<Waypoint | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [crewSize, setCrewSize] = useState(4);
  const [existingRouteId, setExistingRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');

  // Load existing route if in edit mode
  useEffect(() => {
    if (mode === 'edit' && routeId) {
      db.routes.get(routeId).then((route) => {
        if (route) {
          setRouteName(route.name);
          setDescription(route.description ?? '');
          setWaypoints(route.waypoints);
          setExistingRouteId(route.id);
        }
        setLoading(false);
      });
    }
  }, [mode, routeId]);

  const addWaypointAt = useCallback(
    (lat: number, lng: number, name?: string) => {
      setWaypoints((prev) => {
        const wp: Waypoint = {
          id: uuid(),
          routeId: existingRouteId ?? '',
          position: { lat, lng },
          name: name ?? `WP${prev.length + 1}`,
          sequenceOrder: prev.length,
          waypointType: prev.length === 0 ? 'departure' : 'waypoint',
        };
        return [...prev, wp];
      });
    },
    [existingRouteId]
  );

  const handleMapClick = (lat: number, lng: number) => {
    addWaypointAt(lat, lng);
  };

  const handleWaypointDrag = (id: string, lat: number, lng: number) => {
    setWaypoints((prev) =>
      prev.map((w) => (w.id === id ? { ...w, position: { ...w.position, lat, lng } } : w))
    );
  };

  const handleWaypointSave = (updated: Waypoint) => {
    setWaypoints((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const handleWaypointDelete = (id: string) => {
    setWaypoints((prev) =>
      prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, sequenceOrder: i }))
    );
  };

  const handleDestinationPick = (dest: Destination) => {
    addWaypointAt(dest.position.lat, dest.position.lng, dest.name);
  };

  const handleImportGPX = async (file: File) => {
    try {
      const text = await file.text();
      const { name, waypoints: imported } = parseGPX(text);
      setRouteName(name);
      setWaypoints(imported);
    } catch (err) {
      alert(`Failed to import GPX: ${(err as Error).message}`);
    }
  };

  const legs = waypoints.slice(1).map((wp, i) => {
    const from = waypoints[i].position;
    const to = wp.position;
    const dist = distanceNM(from, to);
    const bTrue = bearingTrue(from, to);
    const bMag = bearingMagnetic(bTrue, from);
    const time = etaHours(dist, boatConfig.cruisingSpeedKnots);
    const fuel = fuelConsumption(dist, boatConfig.cruisingSpeedKnots, boatConfig.fuelConsumptionGPH);
    return { fromId: waypoints[i].id, toId: wp.id, dist, bTrue, bMag, time, fuel };
  });

  const totalDist = legs.reduce((sum, l) => sum + l.dist, 0);
  const totalTime = legs.reduce((sum, l) => sum + l.time, 0);
  const totalFuel = legs.reduce((sum, l) => sum + l.fuel, 0);
  const totalDays = Math.max(1, Math.ceil(totalTime / 24));
  const totalWater = totalDays * crewSize * 1.0; // 1 gal per person per day

  const saveRoute = async () => {
    const id = existingRouteId ?? uuid();
    const wps = waypoints.map((w) => ({ ...w, routeId: id }));
    const now = Date.now();

    const route: Route = {
      id,
      name: routeName || 'Untitled Route',
      description: description || undefined,
      createdAt: existingRouteId ? (await db.routes.get(id))?.createdAt ?? now : now,
      updatedAt: now,
      totalDistanceNM: totalDist,
      totalEstimatedTimeHours: totalTime,
      totalEstimatedFuelGallons: totalFuel,
      expectedSpeedKnots: boatConfig.cruisingSpeedKnots,
      fuelConsumptionGPH: boatConfig.fuelConsumptionGPH,
      waypoints: wps,
      legs: legs.map((l) => ({
        fromWaypointId: l.fromId,
        toWaypointId: l.toId,
        distanceNM: l.dist,
        bearingTrue: l.bTrue,
        bearingMagnetic: l.bMag,
        estimatedTimeHours: l.time,
        estimatedFuelGallons: l.fuel,
      })),
    };

    await db.routes.put(route);

    // If launched from a trip page, auto-link this route to that trip
    if (tripIdParam) {
      const trip = await db.trips.get(tripIdParam);
      if (trip && !trip.routeIds.includes(id)) {
        await db.trips.update(tripIdParam, {
          routeIds: [...trip.routeIds, id],
          updatedAt: Date.now(),
        });
      }
      navigate(`/trips/${tripIdParam}`);
    } else {
      navigate(`/routes/${id}`);
    }
  };

  const exportGPX = () => {
    const route: Route = {
      id: existingRouteId ?? 'temp',
      name: routeName || 'Untitled Route',
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalDistanceNM: totalDist,
      totalEstimatedTimeHours: totalTime,
      totalEstimatedFuelGallons: totalFuel,
      expectedSpeedKnots: boatConfig.cruisingSpeedKnots,
      fuelConsumptionGPH: boatConfig.fuelConsumptionGPH,
      waypoints,
      legs: [],
    };
    downloadGPX(route);
  };

  const positions: [number, number][] = waypoints.map((w) => [w.position.lat, w.position.lng]);

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(tripIdParam ? `/trips/${tripIdParam}` : '/routes')}
            className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <input
            type="text"
            placeholder="Route name..."
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            className="flex-1 rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
          />
          <button
            onClick={saveRoute}
            disabled={waypoints.length < 2}
            className="flex items-center gap-1.5 rounded bg-sea-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
          >
            <Anchor className="h-3.5 w-3.5" />
            From Destinations
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex shrink-0 items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
          >
            <Upload className="h-3.5 w-3.5" />
            Import GPX
          </button>
          <button
            onClick={exportGPX}
            disabled={waypoints.length < 2}
            className="flex shrink-0 items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export GPX
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportGPX(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <NauticalMap
          center={
            waypoints.length > 0
              ? [waypoints[0].position.lat, waypoints[0].position.lng]
              : undefined
          }
          onClick={handleMapClick}
        >
          {waypoints.map((wp, i) => (
            <Marker
              key={wp.id}
              position={[wp.position.lat, wp.position.lng]}
              icon={makeWaypointIcon(wp.waypointType, i, waypoints.length)}
              draggable
              eventHandlers={{
                click: () => setEditingWaypoint(wp),
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  handleWaypointDrag(wp.id, lat, lng);
                },
              }}
            />
          ))}
          {positions.length >= 2 && (
            <Polyline
              positions={positions}
              pathOptions={{ color: '#40c1d0', weight: 2.5, dashArray: '8 4' }}
            />
          )}
        </NauticalMap>

        {waypoints.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
            <div className="rounded-lg bg-slate-900/80 px-4 py-3 text-center backdrop-blur-sm">
              <p className="text-sm text-slate-300">Tap the chart to add waypoints</p>
              <p className="mt-1 text-xs text-slate-500">Drag to move • Tap to edit</p>
            </div>
          </div>
        )}

        {/* Stats card */}
        {waypoints.length >= 2 && (
          <div className="absolute left-3 top-3 z-[1000] rounded-lg border border-slate-700 bg-slate-900/90 p-2 text-xs backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="flex items-center gap-1 text-slate-400">
                <Navigation className="h-3 w-3" />
                <span>{formatDistance(totalDist)}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(totalTime)}</span>
              </div>
              <div className="flex items-center gap-1 text-amber-400">
                <Fuel className="h-3 w-3" />
                <span>{totalFuel.toFixed(1)} gal</span>
              </div>
              <div className="flex items-center gap-1 text-blue-400">
                <Droplets className="h-3 w-3" />
                <span>{totalWater.toFixed(0)} gal</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leg table */}
      {waypoints.length > 0 && (
        <div className="max-h-60 overflow-auto border-t border-slate-800 bg-slate-900">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Waypoint</th>
                <th className="px-2 py-1.5 text-right font-medium">Dist</th>
                <th className="px-2 py-1.5 text-right font-medium">Brg(M)</th>
                <th className="px-2 py-1.5 text-right font-medium">Time</th>
                <th className="px-2 py-1.5 text-right font-medium">Fuel</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {waypoints.map((wp, i) => (
                <tr
                  key={wp.id}
                  onClick={() => setEditingWaypoint(wp)}
                  className="cursor-pointer border-t border-slate-800/50 hover:bg-slate-800/50"
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: WAYPOINT_COLORS[wp.waypointType] }}
                      />
                      <span className="truncate">{wp.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {i > 0 ? formatDistance(legs[i - 1].dist) : '--'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {i > 0 ? formatBearing(legs[i - 1].bMag) : '--'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {i > 0 ? formatDuration(legs[i - 1].time) : '--'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {i > 0 ? `${legs[i - 1].fuel.toFixed(1)}g` : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
            {waypoints.length >= 2 && (
              <tfoot className="border-t border-slate-700 bg-slate-900 font-medium text-sea-400">
                <tr>
                  <td className="px-2 py-1.5">Total</td>
                  <td className="px-2 py-1.5 text-right">{formatDistance(totalDist)}</td>
                  <td className="px-2 py-1.5 text-right">--</td>
                  <td className="px-2 py-1.5 text-right">{formatDuration(totalTime)}</td>
                  <td className="px-2 py-1.5 text-right">{totalFuel.toFixed(1)}g</td>
                </tr>
                <tr className="text-xs text-slate-400">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <span>Crew</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={crewSize}
                        onChange={(e) => setCrewSize(Number(e.target.value) || 1)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-12 rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-200 outline-none"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">{totalDays}d</td>
                  <td className="px-2 py-1.5 text-right">Water</td>
                  <td className="px-2 py-1.5 text-right" colSpan={2}>
                    <span className="text-blue-400">{totalWater.toFixed(0)} gal</span>
                    <span className="ml-1 text-slate-600">
                      / {boatConfig.waterCapacityGallons} tank
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <WaypointEditor
        waypoint={editingWaypoint}
        onClose={() => setEditingWaypoint(null)}
        onSave={handleWaypointSave}
        onDelete={handleWaypointDelete}
      />
      <DestinationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handleDestinationPick}
      />
    </div>
  );
}

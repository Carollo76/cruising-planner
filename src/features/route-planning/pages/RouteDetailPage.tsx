import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Download,
  Navigation,
  Clock,
  Fuel,
  Droplets,
  Gauge,
  Copy,
  FileText,
} from 'lucide-react';
import { NauticalMap } from '../../../components/map/NauticalMap';
import { db } from '../../../db/database';
import type { Route, Waypoint } from '../../../types/navigation';
import {
  formatDistance,
  formatBearing,
  formatDuration,
} from '../../../utils/navigation-math';
import { downloadGPX } from '../utils/gpx';
import { copyRouteToClipboard, downloadRouteAsText } from '../utils/predictwind-export';
import { useSettingsStore } from '../../../stores/settings-store';

const WAYPOINT_COLORS: Record<Waypoint['waypointType'], string> = {
  departure: '#22c55e',
  waypoint: '#40c1d0',
  destination: '#3b82f6',
  anchorage: '#f59e0b',
  hazard: '#ef4444',
};

function makeIcon(type: Waypoint['waypointType'], index: number, total: number): L.DivIcon {
  const color = WAYPOINT_COLORS[type];
  const label = index === 0 ? 'S' : index === total - 1 ? 'E' : String(index);
  return new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;border:2px solid ${color};background:${color}44;color:${color};font-size:10px;font-weight:700;">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { boatConfig } = useSettingsStore();
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    if (!id) return;
    db.routes.get(id).then((r) => {
      setRoute(r ?? null);
      setLoading(false);
    });
  }, [id]);

  const handleDelete = async () => {
    if (!route) return;
    if (confirm(`Delete route "${route.name}"? This cannot be undone.`)) {
      await db.routes.delete(route.id);
      navigate('/planner/routes');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="p-4">
        <p className="text-slate-400">Route not found</p>
        <Link to="/planner/routes" className="mt-4 inline-block text-sea-400">
          Back to routes
        </Link>
      </div>
    );
  }

  const positions: [number, number][] = route.waypoints.map((w) => [w.position.lat, w.position.lng]);
  const center: [number, number] = positions.length > 0 ? positions[0] : [38, -76];

  return (
    <div>
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/planner/routes')}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">{route.name}</h2>
            {route.description && (
              <p className="text-xs text-slate-400">{route.description}</p>
            )}
          </div>
          <Link
            to={`/planner/routes/${route.id}/edit`}
            className="flex items-center gap-1 rounded bg-sea-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sea-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </div>

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-800 p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Navigation className="h-3.5 w-3.5" />
              Distance
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {formatDistance(route.totalDistanceNM)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              Duration
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {formatDuration(route.totalEstimatedTimeHours)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Fuel className="h-3.5 w-3.5" />
              Fuel
            </div>
            <div className="mt-1 text-lg font-semibold text-amber-400">
              {route.totalEstimatedFuelGallons.toFixed(1)} gal
            </div>
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Gauge className="h-3.5 w-3.5" />
              Speed
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {route.expectedSpeedKnots} kt
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="h-[40vh] border-b border-slate-800">
        <NauticalMap center={center} zoom={10}>
          {route.waypoints.map((wp, i) => (
            <Marker
              key={wp.id}
              position={[wp.position.lat, wp.position.lng]}
              icon={makeIcon(wp.waypointType, i, route.waypoints.length)}
            />
          ))}
          {positions.length >= 2 && (
            <Polyline
              positions={positions}
              pathOptions={{ color: '#40c1d0', weight: 2.5, dashArray: '8 4' }}
            />
          )}
        </NauticalMap>
      </div>

      {/* Waypoint and leg details */}
      <div className="p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Waypoints & Legs
        </h3>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Waypoint</th>
                <th className="px-3 py-2 text-right font-medium">Dist</th>
                <th className="px-3 py-2 text-right font-medium">Brg(T)</th>
                <th className="px-3 py-2 text-right font-medium">Brg(M)</th>
                <th className="px-3 py-2 text-right font-medium">Time</th>
                <th className="px-3 py-2 text-right font-medium">Fuel</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {route.waypoints.map((wp, i) => {
                const leg = i > 0 ? route.legs[i - 1] : null;
                return (
                  <tr key={wp.id} className="border-t border-slate-800/50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: WAYPOINT_COLORS[wp.waypointType] }}
                        />
                        <span>{wp.name}</span>
                      </div>
                      {wp.notes && (
                        <div className="mt-0.5 text-xs text-slate-500">{wp.notes}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {leg ? formatDistance(leg.distanceNM) : '--'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {leg ? formatBearing(leg.bearingTrue) : '--'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {leg ? formatBearing(leg.bearingMagnetic) : '--'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {leg ? formatDuration(leg.estimatedTimeHours) : '--'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {leg ? `${leg.estimatedFuelGallons.toFixed(1)}g` : '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Water estimate */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
          <Droplets className="h-4 w-4 text-blue-400" />
          <span className="text-slate-300">
            Water estimate (4 crew):{' '}
            <span className="text-blue-400">
              {Math.max(1, Math.ceil(route.totalEstimatedTimeHours / 24)) * 4} gal
            </span>
            <span className="ml-1 text-slate-500">
              / {boatConfig.waterCapacityGallons} gal tank
            </span>
          </span>
        </div>

        {/* Actions */}
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Export
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadGPX(route)}
              className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              title="GPX works with Navionics, OpenCPN, Garmin, B&G, Raymarine, Furuno"
            >
              <Download className="h-4 w-4" />
              GPX (Navionics, etc.)
            </button>
            <button
              onClick={async () => {
                await copyRouteToClipboard(route);
                setCopyToast(true);
                setTimeout(() => setCopyToast(false), 2000);
              }}
              className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              title="Copy a formatted text summary for pasting into PredictWind, Slack, email, etc."
            >
              <Copy className="h-4 w-4" />
              {copyToast ? 'Copied!' : 'Copy for PredictWind'}
            </button>
            <button
              onClick={() => downloadRouteAsText(route)}
              className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              title="Download .txt file with all route details — share via email or text"
            >
              <FileText className="h-4 w-4" />
              Text
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <strong>PredictWind / Navionics:</strong> use GPX for direct import into chartplotters and Navionics Boating. Use "Copy for PredictWind" to paste a text summary into PredictWind Offshore or share via iMessage.
          </p>
        </div>

        <div className="mt-4">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete Route
          </button>
        </div>
      </div>
    </div>
  );
}

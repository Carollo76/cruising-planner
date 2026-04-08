import { useState, useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import type { Waypoint } from '../../../types/navigation';

interface WaypointEditorProps {
  waypoint: Waypoint | null;
  onClose: () => void;
  onSave: (waypoint: Waypoint) => void;
  onDelete: (id: string) => void;
}

const WAYPOINT_TYPES: { value: Waypoint['waypointType']; label: string; color: string }[] = [
  { value: 'departure', label: 'Departure', color: 'bg-green-500/20 text-green-400' },
  { value: 'waypoint', label: 'Waypoint', color: 'bg-sea-500/20 text-sea-400' },
  { value: 'destination', label: 'Destination', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'anchorage', label: 'Anchorage', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'hazard', label: 'Hazard', color: 'bg-red-500/20 text-red-400' },
];

export function WaypointEditor({ waypoint, onClose, onSave, onDelete }: WaypointEditorProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Waypoint['waypointType']>('waypoint');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (waypoint) {
      setName(waypoint.name);
      setType(waypoint.waypointType);
      setNotes(waypoint.notes ?? '');
    }
  }, [waypoint]);

  if (!waypoint) return null;

  const handleSave = () => {
    onSave({
      ...waypoint,
      name: name.trim() || waypoint.name,
      waypointType: type,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  const handleDelete = () => {
    onDelete(waypoint.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl border border-slate-700 bg-slate-900 p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">Edit Waypoint</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
            <div className="flex flex-wrap gap-2">
              {WAYPOINT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    type === t.value ? t.color : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Hazards, landmarks, checkpoints..."
              className="w-full resize-none rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>

          <div className="rounded bg-slate-800/50 p-3 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Latitude</span>
              <span className="font-mono text-slate-300">{waypoint.position.lat.toFixed(5)}°</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Longitude</span>
              <span className="font-mono text-slate-300">{waypoint.position.lng.toFixed(5)}°</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Users, Plus, Shield, User } from 'lucide-react';
import { db } from '../../../db/database';
import type { CrewMember } from '../../../types/crew';

const roleColors: Record<string, string> = {
  captain: 'bg-amber-500/10 text-amber-400',
  'first-mate': 'bg-blue-500/10 text-blue-400',
  crew: 'bg-green-500/10 text-green-400',
  passenger: 'bg-slate-500/10 text-slate-400',
};

export function CrewListPage() {
  const [crew, setCrew] = useState<CrewMember[]>([]);

  useEffect(() => {
    db.crewMembers.toArray().then(setCrew);
  }, []);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Crew</h2>
        <button className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700">
          <Plus className="h-4 w-4" />
          Add Crew
        </button>
      </div>

      {crew.length === 0 ? (
        <div className="mt-12 text-center text-slate-400">
          <Users className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No crew members yet</p>
          <p className="mt-1 text-sm">Add your family and crew</p>
        </div>
      ) : (
        <div className="space-y-2">
          {crew.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
                <User className="h-5 w-5 text-slate-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-slate-100">{member.name}</h3>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleColors[member.role]}`}>
                    {member.role.replace('-', ' ')}
                  </span>
                  {member.canStandWatch && (
                    <span className="flex items-center gap-0.5 text-xs text-green-400">
                      <Shield className="h-3 w-3" />
                      Watch
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

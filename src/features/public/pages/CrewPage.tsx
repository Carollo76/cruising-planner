import { Anchor, Heart, Star } from 'lucide-react';

interface CrewMember {
  name: string;
  role: string;
  photo?: string;
  bio: string;
  accent: string;
}

// NOTE: Update these bios and photo assignments once you have crew-specific portraits.
const crew: CrewMember[] = [
  {
    name: 'Christian',
    role: 'Captain',
    photo: '/photos/09-dressed-ship-sunset.jpeg',
    bio: "Owner, captain, and weather-watcher-in-chief. Brought Well Adjusted home to Centerport in 2024 and spends off-watch hours planning the next cruise.",
    accent: 'bg-amber-500/10 text-amber-400',
  },
  {
    name: 'Sandra',
    role: 'First Mate',
    photo: '/photos/04-family-in-cockpit.jpeg',
    bio: 'First Mate and navigator. Handles galley, lines, and keeps the crew fed and morale high from Centerport to wherever the wind goes.',
    accent: 'bg-blue-500/10 text-blue-400',
  },
  {
    name: 'Frankie',
    role: 'Crew',
    photo: '/photos/08-binoculars-watch.jpeg',
    bio: 'On lookout duty with the binoculars. Chief spotter of tall ships, passing lobster boats, and anything interesting on the horizon.',
    accent: 'bg-green-500/10 text-green-400',
  },
  {
    name: 'Christian Jr.',
    role: 'Crew',
    photo: '/photos/05-family-sailing.jpeg',
    bio: "Junior skipper in training. Will happily take the wheel any chance he gets. Also an expert at swimming off the stern.",
    accent: 'bg-purple-500/10 text-purple-400',
  },
];

export function CrewPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="text-center">
        <Heart className="mx-auto h-10 w-10 text-sea-400" />
        <h1 className="mt-4 text-3xl font-bold text-slate-100 sm:text-4xl">The Crew</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          The Carollo family — four of us aboard Well Adjusted, plus whoever else
          is lucky enough to join for a sail.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {crew.map((member) => (
          <div
            key={member.name}
            className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
          >
            {member.photo && (
              <div className="aspect-[4/3] w-full overflow-hidden bg-slate-800">
                <img
                  src={member.photo}
                  alt={member.name}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-100">{member.name}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${member.accent}`}>
                  {member.role}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{member.bio}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Family photo */}
      <div className="mt-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Star className="h-4 w-4 text-sea-400" />
          All Hands
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <img
            src="/photos/04-family-in-cockpit.jpeg"
            alt="The Carollo family in the cockpit of Well Adjusted"
            className="w-full"
          />
        </div>
      </div>

      <div className="mt-10 rounded-lg border border-slate-800 bg-slate-900 p-5 text-center">
        <Anchor className="mx-auto mb-2 h-5 w-5 text-sea-400" />
        <p className="text-sm text-slate-400">
          Any guest aboard becomes temporary crew. Your job is to hold a beverage and enjoy the ride.
        </p>
      </div>
    </div>
  );
}

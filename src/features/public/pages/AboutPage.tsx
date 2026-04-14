import { Anchor, Ruler, Ship, Fuel, Droplets, Gauge, Users, Navigation } from 'lucide-react';

const specs = [
  { icon: Ruler, label: 'Length (LOA)', value: '36.8 ft' },
  { icon: Ship, label: 'Beam', value: '12.1 ft' },
  { icon: Navigation, label: 'Draft', value: '5.9 ft' },
  { icon: Gauge, label: 'Cruising Speed', value: '6.0 kt under power' },
  { icon: Fuel, label: 'Fuel', value: '32 gal · 40 HP Yanmar' },
  { icon: Droplets, label: 'Water', value: '66 gal' },
  { icon: Users, label: 'Sleeps', value: '6 in 3 cabins' },
  { icon: Anchor, label: 'Rig', value: 'Sloop, fractional rig' },
];

export function AboutPage() {
  return (
    <div>
      {/* Header image */}
      <div className="relative h-64 w-full overflow-hidden sm:h-80">
        <img
          src="/photos/03-stern-new-york-ny.jpeg"
          alt="Well Adjusted stern"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">About the Boat</h1>
        <p className="mt-2 text-slate-400">A 2012 Beneteau Oceanis 37 · New York, NY</p>

        {/* Story */}
        <div className="mt-8 space-y-5 text-slate-300 leading-relaxed">
          <p>
            We bought Well Adjusted in <strong>2024</strong>. She was living at the New
            York Athletic Club in Pelham, NY when we found her. After a thorough search — where
            we looked at a lot of boats that almost made the list — Well Adjusted was the one
            that had everything we were looking for. We fell in love with her.
          </p>
          <p>
            We brought her over to Centerport shortly after, where she now lives on a mooring
            at <strong>Centerport Yacht Club</strong> (which, despite the name, is actually on
            the Northport Harbor side of the peninsula). From there it's easy access to
            Huntington Bay, the Connecticut coast, and the whole of Long Island Sound.
          </p>
          <p>
            She's a <strong>2012 Beneteau Oceanis 37</strong> — a three-cabin, two-head cruiser
            designed by Finot-Conq. Big cockpit, roomy interior, powered by a 40 HP Yanmar
            diesel. Built for comfortable family cruising. And that's exactly what we're doing
            with her.
          </p>
        </div>

        {/* Specs */}
        <h2 className="mt-12 text-2xl font-semibold text-slate-100">Specifications</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {specs.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sea-500/10">
                <Icon className="h-4 w-4 text-sea-400" />
              </div>
              <div>
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-sm font-medium text-slate-100">{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Home port */}
        <h2 className="mt-12 text-2xl font-semibold text-slate-100">Home Port</h2>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sea-500/10">
              <Anchor className="h-5 w-5 text-sea-400" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">Centerport Yacht Club</div>
              <div className="mt-1 text-sm text-slate-400">
                Northport Harbor, Centerport, NY
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                40.9055°N, 73.3565°W
              </div>
              <p className="mt-3 text-sm text-slate-300">
                The cruising grounds from here stretch from the North Shore of Long Island
                west to City Island, east to Block Island and Narragansett Bay, and across
                the Sound to the entire Connecticut coast.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Compass, Anchor, Users, Image as ImageIcon, BookOpen, Map, ArrowRight } from 'lucide-react';

export function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative h-[70vh] min-h-[500px] w-full overflow-hidden">
        <img
          src="/photos/01-hero-well-adjusted-at-mooring.jpeg"
          alt="S/V Well Adjusted at mooring"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-slate-950/20" />
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:pb-24">
            <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
              S/V Well Adjusted
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-slate-200 drop-shadow sm:text-xl">
              A family, a sailboat, a summer on Long Island Sound.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/planner"
                className="flex items-center gap-2 rounded-lg bg-sea-600 px-5 py-2.5 font-medium text-white shadow-lg transition-colors hover:bg-sea-500"
              >
                <Map className="h-4 w-4" />
                Open the Cruise Planner
              </Link>
              <Link
                to="/about"
                className="flex items-center gap-2 rounded-lg border border-slate-400/30 bg-slate-900/60 px-5 py-2.5 font-medium text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-800"
              >
                About the boat
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Compass className="mx-auto mb-4 h-10 w-10 text-sea-400" />
        <h2 className="text-2xl font-semibold text-slate-100 sm:text-3xl">
          Fair winds and following seas
        </h2>
        <p className="mt-4 text-slate-300 leading-relaxed">
          Welcome aboard Well Adjusted — our Beneteau Oceanis 37. Bought in 2024 and now
          moored at Centerport Yacht Club in Northport Harbor, she's our family's ticket to
          Long Island Sound, the Connecticut coast, Block Island, and wherever else the wind
          takes us.
        </p>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            to="/about"
            icon={Anchor}
            title="About"
            description="The boat, our story, and the specs"
            color="text-sea-400 bg-sea-500/10"
          />
          <FeatureCard
            to="/crew"
            icon={Users}
            title="Crew"
            description="Meet the Carollo family"
            color="text-green-400 bg-green-500/10"
          />
          <FeatureCard
            to="/gallery"
            icon={ImageIcon}
            title="Gallery"
            description="Photos from our adventures"
            color="text-amber-400 bg-amber-500/10"
          />
          <FeatureCard
            to="/blog"
            icon={BookOpen}
            title="Ship's Log"
            description="Trip reports and sailing stories"
            color="text-purple-400 bg-purple-500/10"
          />
        </div>
      </section>

      {/* Planner CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-sea-950 via-slate-900 to-navy-950 p-8 sm:p-12">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sea-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sea-400">
                <Map className="h-3.5 w-3.5" />
                Onboard Tool
              </div>
              <h2 className="mt-3 text-3xl font-bold text-slate-100 sm:text-4xl">
                The Well Adjusted Cruise Planner
              </h2>
              <p className="mt-4 text-slate-300 leading-relaxed">
                Plan routes on real nautical charts, get Go/No-Go weather assessments from
                Windy and NOAA, time your transits through Plum Gut, The Race, and Hell Gate,
                run pre-departure checklists, generate float plans, and keep a digital
                logbook — all in one place, works offline at sea.
              </p>
              <Link
                to="/planner"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-sea-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-sea-500"
              >
                Open the Planner
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="hidden lg:block">
              <img
                src="/photos/09-dressed-ship-sunset.jpeg"
                alt="Well Adjusted dressed ship at sunset"
                className="rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function FeatureCard({
  to,
  icon: Icon,
  title,
  description,
  color,
}: {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-slate-800 bg-slate-900 p-5 transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-lg"
    >
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold text-slate-100 transition-colors group-hover:text-sea-300">
        {title}
      </h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </Link>
  );
}

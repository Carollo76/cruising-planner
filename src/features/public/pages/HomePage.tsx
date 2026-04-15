import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Anchor, Users, Image as ImageIcon, BookOpen, Map, ArrowRight, ChevronDown } from 'lucide-react';

export function HomePage() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      // Throttle via requestAnimationFrame so we don't update state every pixel
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollY(window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Parallax: image moves UP slower than scroll (creates depth), text fades out as you scroll
  const imageOffset = scrollY * 0.4;     // image translates up at 40% of scroll speed
  const textOpacity = Math.max(0, 1 - scrollY / 400);
  const textOffset = scrollY * 0.3;       // text drifts up faster

  return (
    <>
      {/* Hero — magazine-style split: text left, portrait photo right */}
      <section className="relative overflow-hidden bg-slate-950">
        {/* Ambient gradient background using the photo — very blurred, behind everything */}
        <div className="pointer-events-none absolute inset-0">
          <img
            src="/photos/01-hero-well-adjusted-at-mooring.jpeg"
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover object-center opacity-25 blur-3xl"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/80 to-sea-950/60" />
        </div>

        {/* Content grid */}
        <div className="relative mx-auto grid min-h-[calc(100vh-64px)] max-w-7xl grid-cols-1 items-center gap-8 px-4 py-12 lg:grid-cols-[1fr_1.2fr] lg:gap-12 lg:py-16">
          {/* LEFT: Title, tagline, CTAs */}
          <div
            className="order-2 lg:order-1"
            style={{
              transform: `translate3d(0, -${textOffset * 0.5}px, 0)`,
              opacity: textOpacity,
            }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-sea-500/30 bg-sea-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sea-300">
              <Compass className="h-3.5 w-3.5" />
              Long Island Sound · Summer 2026
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
              S/V Well Adjusted
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-300 sm:text-xl">
              A 2012 Beneteau Oceanis 37. A family. And a summer to explore Long Island Sound,
              the Connecticut coast, and wherever the wind takes us.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/planner"
                className="flex items-center gap-2 rounded-lg bg-sea-600 px-5 py-3 text-base font-medium text-white shadow-lg transition-all hover:scale-105 hover:bg-sea-500"
              >
                <Map className="h-4 w-4" />
                Open the Cruise Planner
              </Link>
              <Link
                to="/about"
                className="flex items-center gap-2 rounded-lg border border-slate-500/50 bg-slate-900/60 px-5 py-3 text-base font-medium text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-800"
              >
                About the boat
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* RIGHT: Portrait photo with polished frame + subtle parallax */}
          <div
            className="order-1 flex justify-center lg:order-2 lg:justify-end"
            style={{
              transform: `translate3d(0, ${imageOffset * 0.3}px, 0)`,
            }}
          >
            <div className="group relative">
              {/* Soft colored glow behind the image */}
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-sea-500/20 via-sea-600/10 to-transparent blur-2xl" />
              {/* The photo */}
              <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl transition-transform duration-500 group-hover:scale-[1.01]">
                <img
                  src="/photos/01-hero-well-adjusted-at-mooring.jpeg"
                  alt="S/V Well Adjusted at mooring in Northport Harbor"
                  className="block max-h-[88vh] w-auto object-cover"
                />
                {/* Subtle caption badge bottom-left */}
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                  Northport Harbor · Dawn
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center"
          style={{ opacity: textOpacity }}
        >
          <div className="flex flex-col items-center gap-1 text-xs uppercase tracking-widest text-white/70">
            <span>Scroll</span>
            <ChevronDown className="h-5 w-5 animate-bounce" />
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

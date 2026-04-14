import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

interface Photo {
  src: string;
  alt: string;
  caption?: string;
}

const photos: Photo[] = [
  {
    src: '/photos/01-hero-well-adjusted-at-mooring.jpeg',
    alt: 'Well Adjusted on the mooring at sunrise',
    caption: 'On the mooring at Centerport YC, early morning light',
  },
  {
    src: '/photos/09-dressed-ship-sunset.jpeg',
    alt: 'Well Adjusted dressed with signal flags',
    caption: 'Dressed ship at sunset',
  },
  {
    src: '/photos/02-bow-at-dock.jpeg',
    alt: 'Bow of Well Adjusted at the dock',
    caption: 'Bow view at the dock',
  },
  {
    src: '/photos/03-stern-new-york-ny.jpeg',
    alt: 'Stern with New York, NY hailing port',
    caption: 'New York, NY — the hailing port',
  },
  {
    src: '/photos/04-family-in-cockpit.jpeg',
    alt: 'The Carollo family in the cockpit',
    caption: 'The whole crew in the cockpit',
  },
  {
    src: '/photos/05-family-sailing.jpeg',
    alt: 'Family sailing with kid at the wheel',
    caption: 'Junior skipper at the helm',
  },
  {
    src: '/photos/06-kids-swimming.jpeg',
    alt: 'Kids swimming off the stern',
    caption: 'Swim call — the best part of any anchorage',
  },
  {
    src: '/photos/07-tall-ship-encounter.jpeg',
    alt: 'Watching a tall ship sail by',
    caption: 'Red-sailed schooner passing by',
  },
  {
    src: '/photos/08-binoculars-watch.jpeg',
    alt: 'Boy watching with binoculars',
    caption: 'On lookout duty',
  },
];

export function GalleryPage() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const openLightbox = (i: number) => setActiveIndex(i);
  const closeLightbox = () => setActiveIndex(null);
  const prev = () =>
    setActiveIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
  const next = () =>
    setActiveIndex((i) => (i === null ? null : (i + 1) % photos.length));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center">
        <ImageIcon className="mx-auto h-10 w-10 text-sea-400" />
        <h1 className="mt-4 text-3xl font-bold text-slate-100 sm:text-4xl">Gallery</h1>
        <p className="mt-3 text-slate-400">Moments aboard Well Adjusted</p>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, i) => (
          <button
            key={photo.src}
            onClick={() => openLightbox(i)}
            className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-800 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-sea-500"
          >
            <img
              src={photo.src}
              alt={photo.alt}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {photo.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-3 text-left opacity-0 transition-opacity group-hover:opacity-100">
                <p className="text-sm font-medium text-white">{photo.caption}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {activeIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20 sm:left-8"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20 sm:right-8"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={photos[activeIndex].src}
              alt={photos[activeIndex].alt}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            {photos[activeIndex].caption && (
              <p className="mt-4 max-w-2xl text-center text-sm text-slate-300">
                {photos[activeIndex].caption}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {activeIndex + 1} of {photos.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { ArrowLeft, Save, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { BlogPost } from '../../../types/blog';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

const AVAILABLE_PHOTOS = [
  '/photos/01-hero-well-adjusted-at-mooring.jpeg',
  '/photos/02-bow-at-dock.jpeg',
  '/photos/03-stern-new-york-ny.jpeg',
  '/photos/04-family-in-cockpit.jpeg',
  '/photos/05-family-sailing.jpeg',
  '/photos/06-kids-swimming.jpeg',
  '/photos/07-tall-ship-encounter.jpeg',
  '/photos/08-binoculars-watch.jpeg',
  '/photos/09-dressed-ship-sunset.jpeg',
];

export function BlogEditorPage() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isNew = !slugParam || slugParam === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [coverImage, setCoverImage] = useState<string>('');
  const [author, setAuthor] = useState('Christian');
  const [sailDate, setSailDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [tagsInput, setTagsInput] = useState('');
  const [createdAt, setCreatedAt] = useState(Date.now());

  useEffect(() => {
    if (isNew || !slugParam) return;
    db.blogPosts
      .where('slug')
      .equals(slugParam)
      .first()
      .then((p) => {
        if (p) {
          setExistingId(p.id);
          setTitle(p.title);
          setSlug(p.slug);
          setExcerpt(p.excerpt);
          setBody(p.body);
          setCoverImage(p.coverImage ?? '');
          setAuthor(p.author);
          setSailDate(p.sailDate ?? format(new Date(p.publishedAt), 'yyyy-MM-dd'));
          setStatus(p.status);
          setTagsInput((p.tags ?? []).join(', '));
          setCreatedAt(p.publishedAt);
        }
        setLoading(false);
      });
  }, [isNew, slugParam]);

  // Auto-generate slug when title changes (only for new posts or if slug matches previous title)
  useEffect(() => {
    if (isNew) setSlug(slugify(title));
  }, [title, isNew]);

  const save = async () => {
    if (!title.trim()) {
      alert('Title is required');
      return;
    }
    const postId = existingId ?? uuid();
    const finalSlug = slug || slugify(title);
    const now = Date.now();
    const post: BlogPost = {
      id: postId,
      title: title.trim(),
      slug: finalSlug,
      excerpt: excerpt.trim() || body.slice(0, 200) + (body.length > 200 ? '...' : ''),
      body: body.trim(),
      coverImage: coverImage || undefined,
      author: author.trim() || 'Christian',
      sailDate: sailDate || undefined,
      publishedAt: isNew ? now : createdAt,
      updatedAt: now,
      status,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    await db.blogPosts.put(post);
    navigate(status === 'published' ? `/blog/${finalSlug}` : '/blog');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-500">Loading...</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to="/blog"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="flex-1 flex items-center gap-2 text-xl font-semibold text-slate-100">
          <FileText className="h-5 w-5 text-sea-400" />
          {isNew ? 'New Log Entry' : 'Edit Entry'}
        </h1>
        <button
          onClick={save}
          disabled={!title.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-500 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {status === 'draft' ? 'Save Draft' : 'Publish'}
        </button>
      </div>

      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A weekend to Port Jefferson"
            className="w-full rounded-lg bg-slate-800 px-4 py-3 text-lg font-semibold text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-sea-500"
            autoFocus
          />
          {!isNew && (
            <p className="mt-1 font-mono text-xs text-slate-500">/blog/{slug}</p>
          )}
        </div>

        {/* Meta row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Author</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Sail Date</label>
            <input
              type="date"
              value={sailDate}
              onChange={(e) => setSailDate(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Tags (comma-separated)</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="day sail, port jefferson, kids"
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </div>

        {/* Cover image picker */}
        <div>
          <label className="mb-2 block text-xs font-medium text-slate-400">Cover Image</label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <button
              onClick={() => setCoverImage('')}
              className={`aspect-[4/3] rounded border-2 text-xs text-slate-400 transition-colors ${
                !coverImage ? 'border-sea-500 bg-sea-500/10 text-sea-300' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }`}
            >
              None
            </button>
            {AVAILABLE_PHOTOS.map((src) => (
              <button
                key={src}
                onClick={() => setCoverImage(src)}
                className={`relative aspect-[4/3] overflow-hidden rounded border-2 transition-colors ${
                  coverImage === src ? 'border-sea-500' : 'border-transparent hover:border-slate-600'
                }`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Excerpt */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Excerpt <span className="text-slate-600">(optional — auto-generated from body if blank)</span>
          </label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            placeholder="A short summary shown on the blog list"
            className="w-full resize-none rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </div>

        {/* Body */}
        <div>
          <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Body</span>
            <span className="text-slate-600">Separate paragraphs with blank lines</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            placeholder="Write your trip report, sailing story, or whatever you want to remember about this day on the water..."
            className="w-full rounded bg-slate-800 px-4 py-3 text-base leading-relaxed text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>

        {/* Preview hint */}
        {body && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-xs text-slate-400">
            <Eye className="h-3.5 w-3.5" />
            {body.split(/\s+/).filter(Boolean).length} words · about{' '}
            {Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200))} min read
          </div>
        )}
      </div>
    </div>
  );
}

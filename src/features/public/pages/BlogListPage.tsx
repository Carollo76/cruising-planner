import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Calendar, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { BlogPost } from '../../../types/blog';

export function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.blogPosts
      .orderBy('publishedAt')
      .reverse()
      .toArray()
      .then((all) => {
        setPosts(all.filter((p) => p.status === 'published'));
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-sea-400" />
            <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">Ship's Log</h1>
          </div>
          <p className="mt-2 text-slate-400">Trip reports and stories from aboard Well Adjusted</p>
        </div>
        <Link
          to="/blog/new"
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-500"
        >
          <Plus className="h-4 w-4" />
          New Entry
        </Link>
      </div>

      {loading ? (
        <div className="mt-16 text-center text-sm text-slate-500">Loading...</div>
      ) : posts.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-200">No log entries yet</h2>
          <p className="mt-1 text-sm text-slate-400">
            Write about your first sail, a memorable passage, or just the view from the cockpit.
          </p>
          <Link
            to="/blog/new"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-500"
          >
            <Plus className="h-4 w-4" />
            Write the first entry
          </Link>
        </div>
      ) : (
        <div className="mt-10 space-y-6">
          {posts.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.slug}`}
              className="group block overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-lg"
            >
              {post.coverImage && (
                <div className="aspect-[21/9] w-full overflow-hidden bg-slate-800">
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="p-6">
                <h2 className="text-xl font-semibold text-slate-100 transition-colors group-hover:text-sea-300 sm:text-2xl">
                  {post.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(
                      new Date(post.sailDate || post.publishedAt),
                      'MMM d, yyyy'
                    )}
                  </span>
                  <span>by {post.author}</span>
                  {post.tags && post.tags.length > 0 && (
                    <span className="flex items-center gap-1 text-slate-600">
                      <Tag className="h-3 w-3" />
                      {post.tags.slice(0, 3).join(', ')}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{post.excerpt}</p>
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sea-400">
                  Read more →
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

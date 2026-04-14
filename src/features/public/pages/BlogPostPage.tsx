import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, User, Pencil, Trash2, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { BlogPost } from '../../../types/blog';

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    db.blogPosts
      .where('slug')
      .equals(slug)
      .first()
      .then((p) => {
        setPost(p ?? null);
        setLoading(false);
      });
  }, [slug]);

  const handleDelete = async () => {
    if (!post) return;
    if (confirm(`Delete "${post.title}"? This cannot be undone.`)) {
      await db.blogPosts.delete(post.id);
      navigate('/blog');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-500">Loading...</div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-200">Entry not found</h1>
        <Link to="/blog" className="mt-4 inline-block text-sea-400 hover:underline">
          Back to the log
        </Link>
      </div>
    );
  }

  return (
    <article>
      {post.coverImage && (
        <div className="relative h-72 w-full overflow-hidden sm:h-96">
          <img src={post.coverImage} alt={post.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/blog"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the log
        </Link>

        <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">{post.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {format(new Date(post.sailDate || post.publishedAt), 'MMMM d, yyyy')}
          </span>
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {post.author}
          </span>
          {post.tags && post.tags.length > 0 && (
            <span className="flex items-center gap-1 text-slate-500">
              <Tag className="h-3.5 w-3.5" />
              {post.tags.join(', ')}
            </span>
          )}
        </div>

        {/* Body: render newlines as paragraph breaks */}
        <div className="prose-like mt-8 space-y-4 text-slate-200 leading-relaxed">
          {post.body.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>

        {/* Author actions */}
        <div className="mt-12 flex flex-wrap gap-2 border-t border-slate-800 pt-6">
          <Link
            to={`/blog/${post.slug}/edit`}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  /** Short summary shown on the blog list */
  excerpt: string;
  /** Full body — supports plain text with newlines or light markdown */
  body: string;
  /** Hero image path (optional) — usually under /photos/ */
  coverImage?: string;
  /** Author name */
  author: string;
  /** ISO date the post was written about (the trip/sail date) */
  sailDate?: string;
  /** Published timestamp (ms) */
  publishedAt: number;
  updatedAt: number;
  /** Draft vs published */
  status: 'draft' | 'published';
  /** Optional tags */
  tags?: string[];
}

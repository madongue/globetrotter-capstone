import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, ImagePlus, MapPin, MessageCircle, Send } from 'lucide-react'
import { DESTINATION_BY_ID } from '@/data/destinations'
import { useApp } from '@/store/AppContext'
import { cn, initials, timeAgo } from '@/lib/utils'
import { Button, SafeImage, Textarea } from '@/components/ui'
import { PageHeader } from '@/components/layout/PageHeader'

export function Community() {
  const { t, language, posts, user, addPost, toggleLike, addComment, requireAuth } = useApp()
  const [body, setBody] = useState('')
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const publish = (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    if (!requireAuth() || !user) return

    addPost({
      id: `p-${Date.now()}`,
      author: user.name,
      avatarColor: user.avatarColor,
      body: body.trim(),
      images: [],
      likes: 0,
      comments: [],
      createdAt: new Date().toISOString(),
    })
    setBody('')
  }

  const sendComment = (postId: string) => {
    if (!comment.trim()) return
    if (!requireAuth()) return
    addComment(postId, comment.trim())
    setComment('')
  }

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader
        eyebrow={t('communityTitle')}
        title={t('communityTitle')}
        body={t('communitySubtitle')}
      />

      <div className="mt-8 max-w-2xl space-y-5">
        {/* ----------------------------------------------------- composer */}
        <form onSubmit={publish} className="surface p-4">
          <div className="flex gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xs font-bold text-ink-950"
              style={{ background: user?.avatarColor ?? '#334155' }}
            >
              {user ? initials(user.name) : '?'}
            </span>
            <Textarea
              rows={2}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('communityPlaceholder')}
              aria-label={t('communityPost')}
              className="resize-none border-0 bg-transparent px-0 focus:bg-transparent"
            />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-2xs text-mist-500 hover:text-mist-300">
              <ImagePlus className="h-4 w-4" />
              {language === 'fr' ? 'Photo' : 'Photo'}
              <input type="file" accept="image/*" className="sr-only" />
            </label>
            <Button type="submit" size="sm" disabled={!body.trim()}>
              <Send className="h-3.5 w-3.5" />
              {t('communityPublish')}
            </Button>
          </div>
        </form>

        {/* --------------------------------------------------------- feed */}
        {posts.map((post, index) => {
          const destination = post.destinationId ? DESTINATION_BY_ID[post.destinationId] : null
          return (
            <motion.article
              key={post.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(index, 5) * 0.05 }}
              className="surface overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xs font-bold text-ink-950"
                  style={{ background: post.avatarColor }}
                >
                  {initials(post.author)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-mist-100">{post.author}</p>
                  <p className="text-2xs text-mist-500">{timeAgo(post.createdAt, language)}</p>
                </div>
              </div>

              <p className="px-4 pb-3 text-sm leading-relaxed text-mist-300">{post.body}</p>

              {destination && (
                <Link
                  to={`/app/destinations/${destination.slug}`}
                  className="mx-4 mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-2xs text-cyan-300 hover:bg-white/[0.05]"
                >
                  <MapPin className="h-3 w-3" />
                  {destination.name}
                </Link>
              )}

              {post.images.length > 0 && (
                <SafeImage
                  src={post.images[0]}
                  alt=""
                  className="max-h-80 w-full object-cover"
                />
              )}

              <div className="flex items-center gap-1 border-t border-white/[0.06] px-2 py-2">
                <button
                  type="button"
                  onClick={() => toggleLike(post.id)}
                  aria-pressed={post.liked}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
                    post.liked
                      ? 'text-rose-300'
                      : 'text-mist-500 hover:bg-white/[0.05] hover:text-mist-100',
                  )}
                >
                  <Heart className="h-4 w-4" fill={post.liked ? 'currentColor' : 'none'} />
                  <span className="tabular-nums">{post.likes}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setOpenComments((current) => (current === post.id ? null : post.id))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-mist-500 transition-colors hover:bg-white/[0.05] hover:text-mist-100"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="tabular-nums">{post.comments.length}</span>
                </button>
              </div>

              {openComments === post.id && (
                <div className="border-t border-white/[0.06] bg-white/[0.02] p-4">
                  <ul className="space-y-3">
                    {post.comments.map((entry) => (
                      <li key={entry.id} className="flex gap-2.5">
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-ink-950"
                          style={{ background: entry.avatarColor }}
                        >
                          {initials(entry.author)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-mist-100">{entry.author}</p>
                          <p className="text-xs text-mist-300">{entry.body}</p>
                        </div>
                      </li>
                    ))}
                    {post.comments.length === 0 && (
                      <li className="text-xs text-mist-700">
                        {language === 'fr' ? 'Aucun commentaire.' : 'No comments yet.'}
                      </li>
                    )}
                  </ul>

                  <div className="mt-3 flex gap-2">
                    <input
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder={t('communityComment')}
                      aria-label={t('communityComment')}
                      className="h-9 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-mist-100 placeholder:text-mist-500"
                    />
                    <Button size="sm" onClick={() => sendComment(post.id)} disabled={!comment.trim()}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.article>
          )
        })}
      </div>
    </div>
  )
}

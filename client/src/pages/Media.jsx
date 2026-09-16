import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Image as ImageIcon, MapPin, Send, Upload } from 'lucide-react';
import {
  Button, EmptyState, Field, Input, SectionHead, Skeleton, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import { Avatar } from './Community';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './media.css';

/**
 * Photos travellers have shared.
 *
 * The whole feed requires a session -- GET /media is 401 without one -- so
 * there is no signed-out preview to build. Posting is by URL because that is
 * what the API takes; file upload has its own endpoint (/media/upload) and its
 * own storage backend, which this screen deliberately does not duplicate.
 *
 * Liking is add-only on the server: there is no unlike. So a post already
 * liked shows as liked and stops being a button, rather than offering a toggle
 * that would silently do nothing.
 */

const relativeTime = (iso) => {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return then.toLocaleDateString();
};

function Post({ post, me, token, onChanged }) {
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const likes = post.likes || [];
  const liked = likes.includes(me);

  const like = async () => {
    if (liked) return;
    setBusy(true);
    try {
      const result = await api.likeMedia(post.id, { token });
      onChanged(result?.media || { ...post, likes: [...likes, me] });
    } catch (error) {
      toast.push(error.message || 'Could not like this.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const comment = async (event) => {
    event.preventDefault();
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    try {
      const result = await api.commentOnMedia(post.id, text, { token });
      onChanged(result?.media || post);
      setReply('');
    } catch (error) {
      toast.push(error.message || 'Could not post the comment.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="shot">
      <figure className="shot__figure">
        {post.type === 'video' ? (
          // controls, and nothing else: no autoplay, no loop. A wall of
          // videos all playing at once is a page nobody can read.
          <video
            className="shot__img"
            src={post.url}
            controls
            preload="metadata"
            playsInline
          />
        ) : (
          <img
            className="shot__img"
            src={post.url}
            alt={post.caption || `Shared by ${post.username}`}
            loading="lazy"
          />
        )}
      </figure>

      <div className="shot__body">
        <div className="shot__who">
          <Avatar username={post.username} size={32} />
          <span className="shot__who-text">
            <strong>{post.username}</strong>
            <span className="shot__when">{relativeTime(post.created_at)}</span>
          </span>
        </div>

        {post.caption && <p className="shot__caption">{post.caption}</p>}

        {post.place_id && post.place_name && (
          <Link to={`/places/${post.place_id}`} className="shot__place">
            <MapPin size={12} aria-hidden="true" /> {post.place_name}
          </Link>
        )}

        <div className="shot__actions">
          <button
            type="button"
            className={`shot__like${liked ? ' shot__like--on' : ''}`}
            onClick={like}
            disabled={busy || liked}
            aria-label={liked ? 'You liked this' : 'Like this photo'}
          >
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
            <span className="shot__count">{likes.length}</span>
          </button>
        </div>

        {(post.comments || []).length > 0 && (
          <ul className="shot__comments">
            {post.comments.slice(-3).map((item, index) => (
              <li className="shot__comment" key={item.id || `${item.username}-${index}`}>
                <strong>{item.username}</strong> {item.comment}
              </li>
            ))}
          </ul>
        )}

        <form className="shot__reply" onSubmit={comment}>
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Add a comment"
            aria-label={`Comment on ${post.username}'s photo`}
            maxLength={300}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !reply.trim()}>
            <Send size={14} aria-hidden="true" />
          </Button>
        </form>
      </div>
    </article>
  );
}

function MediaInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, username, isAuthenticated } = useAuth();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [previewOk, setPreviewOk] = useState(true);
  const [file, setFile] = useState(null);

  const load = useCallback(() => {
    if (!token) { setLoading(false); return; }
    api.listMedia({ token })
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : (payload?.media || []);
        // Newest first; the server returns them in insertion order.
        setPosts([...list].sort(
          (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
        ));
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  /* Two ways in, because they are genuinely different acts: uploading a file
     from the phone that took it, and pointing at something already on the web.
     The server has an endpoint for each, and classifies photo vs video from
     the file itself rather than from anything this form claims. */
  const share = async (event) => {
    event.preventDefault();
    setPosting(true);
    try {
      const created = file
        ? await api.uploadMedia({ file, caption: caption.trim() }, { token })
        : await api.postMedia({
          url: url.trim(),
          caption: caption.trim(),
          // A web address carries no MIME type, so the extension is all there
          // is to go on. Anything unrecognised stays a photo.
          type: /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(url.trim()) ? 'video' : 'photo',
        }, { token });

      setPosts((current) => [created, ...current]);
      setUrl('');
      setCaption('');
      setFile(null);
      toast.push(created?.type === 'video' ? 'Video shared.' : 'Photo shared.');
    } catch (error) {
      toast.push(error.message || 'Could not share that.', 'error');
    } finally {
      setPosting(false);
    }
  };

  const replacePost = (updated) => setPosts(
    (current) => current.map((item) => (item.id === updated.id ? updated : item)),
  );

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt media">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar media__main">
          <EmptyState
            icon={<ImageIcon size={22} />}
            title="Sign in to see travellers' photos"
            body="The photo feed is shared between people with an account."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  return (
    <div ref={pageRef} className="gt media">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Explore</Button>}
      />

      <main className="gt-page gt-has-tabbar media__main">

        <Breadcrumbs />
        <header className="media__head">
          <h1 className="media__title">Photos</h1>
          <p className="media__lede">
            What travellers have shared from around Cameroon. Add a photo by
            pasting its web address.
          </p>
        </header>

        {/* ------------------------------------------------------- composer */}
        <form className="composer" onSubmit={share}>
          <div className="composer__pick">
            <label className="composer__file">
              <Upload size={15} aria-hidden="true" />
              <span>{file ? file.name : 'Choose a photo or video'}</span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setUrl(''); }}
              />
            </label>
            {file && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}>
                Clear
              </Button>
            )}
          </div>

          <div className="composer__row">
            <Field label="Or paste a web address" hint={file ? 'Not used while a file is chosen' : undefined}>
              <Input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setPreviewOk(true); }}
                placeholder="https://…/photo.jpg"
                disabled={Boolean(file)}
              />
            </Field>
            <Field label="Caption" hint="Optional">
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Sunset at Kribi"
                maxLength={280}
              />
            </Field>
            <Button type="submit" disabled={posting || (!file && !url.trim())}>
              {posting ? 'Sharing…' : 'Share'}
            </Button>
          </div>

          {/* Shown only while the address actually loads, so a typo is obvious
              before it becomes a broken card in the feed. */}
          {!file && url.trim() && previewOk && (
            /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(url.trim()) ? (
              <video className="composer__preview" src={url.trim()} controls preload="metadata" />
            ) : (
              <img
                className="composer__preview"
                src={url.trim()}
                alt=""
                onError={() => setPreviewOk(false)}
              />
            )
          )}
          {!file && url.trim() && !previewOk && (
            <p className="gt-caption gt-muted">That address does not load as an image.</p>
          )}
        </form>

        {/* ----------------------------------------------------------- feed */}
        <section>
          <SectionHead title={loading ? 'Recent photos' : `Recent photos (${posts.length})`} />
          {loading ? (
            <Skeleton height="14rem" />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={<ImageIcon size={20} />}
              title="No photos yet"
              body="Be the first to share one — paste a photo address above."
            />
          ) : (
            <div className="media__feed">
              {posts.map((post) => (
                <Post
                  key={post.id}
                  post={post}
                  me={username}
                  token={token}
                  onChanged={replacePost}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Media() {
  return <ToastProvider><MediaInner /></ToastProvider>;
}

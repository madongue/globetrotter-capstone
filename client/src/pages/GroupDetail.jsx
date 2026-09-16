import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Heart, ImageIcon, MapPin, MessageCircle, Send, Users,
} from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton,
  Textarea, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import { Avatar } from './Community';
import {
  DISCUSSION_TYPES, groupCover, likeCount, replyCount, timeAgo,
} from '../lib/useCommunity';
import { useAuth } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './community.css';

/**
 * One group — and, when a discussion is named in the query string, that
 * discussion's thread.
 *
 * Both live on one screen rather than two routes, because a thread only makes
 * sense inside the group it belongs to, and the API serves them together. The
 * open thread is carried as `?d=<id>` so a reply can be linked to directly.
 */

const TYPE_TONE = { question: 'primary', recommendation: 'success', experience: 'warning' };
const TABS = [
  { id: 'discussions', label: 'Discussions' },
  { id: 'members', label: 'Members' },
  { id: 'media', label: 'Media' },
];

function GroupDetailInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, username, isAuthenticated } = useAuth();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('discussions');
  const [media, setMedia] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', message: '', type: 'question', location: '' });

  const openId = searchParams.get('d');

  const load = async (signal) => {
    try {
      const payload = await api.getGroup(id, { token, signal });
      setGroup(payload?.group || payload);
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.status === 404 ? 'notfound' : (err.message || 'Could not load this group.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    window.scrollTo({ top: 0 });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  useEffect(() => {
    if (!token || tab !== 'media') return;
    api.listMedia({ token })
      .then((p) => setMedia(Array.isArray(p) ? p : p?.media || []))
      .catch(() => setMedia([]));
  }, [token, tab]);

  const discussions = useMemo(
    () => [...(group?.discussions || [])].sort(
      (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
    ),
    [group],
  );

  const openThread = useMemo(
    () => discussions.find((d) => d.id === openId) || null,
    [discussions, openId],
  );

  const members = group?.members || [];
  const joined = members.includes(username);
  const cover = groupCover(group || {});

  const leave = async () => {
    try {
      await api.leaveGroup(id, { token });
      await load();
      toast.push(`Left ${group.name}.`, 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const join = async () => {
    try {
      await api.joinGroup(id, { token });
      await load();
      toast.push(`Joined ${group.name}.`, 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      if (!joined) await api.joinGroup(id, { token });
      await api.replyToDiscussion(id, openThread.id, reply.trim(), { token });
      setReply('');
      await load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const startDiscussion = async (event) => {
    event.preventDefault();
    if (!newPost.title.trim() || !newPost.message.trim()) {
      toast.push('A title and a message are both needed.', 'info');
      return;
    }
    setStarting(true);
    try {
      if (!joined) await api.joinGroup(id, { token });
      const result = await api.createDiscussion(id, {
        title: newPost.title.trim(),
        message: newPost.message.trim(),
        type: newPost.type,
        location: newPost.location.trim(),
      }, { token });
      setNewPost({ title: '', message: '', type: 'question', location: '' });
      await load();
      const created = result?.discussion;
      if (created) setSearchParams({ d: created.id });
      toast.push('Discussion started.', 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const toggleLike = async (discussion) => {
    try {
      await api.likeDiscussion(id, discussion.id, { token });
      await load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const shell = (children) => (
    <div className="gt community">
      <TopBar
        isAuthenticated={isAuthenticated}
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/community')}>Community</Button>}
      />
      {children}
      <TabBar isAuthenticated={isAuthenticated} />
    </div>
  );

  if (!isAuthenticated) {
    return shell(
      <main className="gt-page gt-has-tabbar community__main">
        <EmptyState icon={<Users size={22} />} title="Sign in to see this group"
          action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
      </main>,
    );
  }

  if (loading) {
    return shell(
      <main className="gt-page gt-has-tabbar community__main">
        <Skeleton height="12rem" style={{ borderRadius: 'var(--gt-radius-xl)' }} />
        <div style={{ marginTop: 'var(--gt-space-5)' }}><Skeleton height="2rem" width="45%" /></div>
      </main>,
    );
  }

  if (error || !group) {
    return shell(
      <main className="gt-page gt-has-tabbar community__main">
        <EmptyState
          icon={<Users size={22} />}
          title={error === 'notfound' ? 'That group does not exist' : 'Could not load this group'}
          action={<Button size="sm" onClick={() => navigate('/community')}>Back to Community</Button>}
        />
      </main>,
    );
  }

  return shell(
    <main className="gt-has-tabbar">
      {/* --------------------------------------------------------- cover */}
      <section className="gt-page gd__cover-wrap">
        <Link to="/community" className="gd__back"><ArrowLeft size={16} aria-hidden="true" /> Community</Link>

        <div className="gd__cover">
          {cover ? (
            <>
              <img src={cover.url} alt="" />
              <span className="gd__scrim" />
              <span className="gd__citytag">{cover.city} · city photo</span>
            </>
          ) : <span className="gd__cover-empty" aria-hidden="true"><Users size={28} /></span>}

          <div className="gd__cover-text">
            <h1 className="gd__name">{group.name}</h1>
            {group.description && <p className="gd__desc">{group.description}</p>}
            <span className="gd__members"><Users size={14} aria-hidden="true" /> {members.length} member{members.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="gd__actions">
          {joined ? (
            <>
              <Badge tone="success">Joined</Badge>
              {/* The creator cannot leave — the server refuses, so the control
                  is not offered either. */}
              {group.created_by !== username && (
                <Button size="sm" variant="ghost" onClick={leave}>Leave group</Button>
              )}
            </>
          ) : <Button size="sm" onClick={join}>Join group</Button>}
        </div>
      </section>

      {/* ---------------------------------------------------------- tabs */}
      <div className="gt-page gd__tabs" role="tablist" aria-label="Group sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`gd__tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'discussions' && discussions.length > 0 && <span className="gd__tab-count">{discussions.length}</span>}
            {t.id === 'members' && <span className="gd__tab-count">{members.length}</span>}
          </button>
        ))}
      </div>

      <div className="gt-page gd__body">
        {/* -------------------------------------------------- discussions */}
        {tab === 'discussions' && (openThread ? (
          /* ------------------------------------------ one thread */
          <article className="thread">
            <button type="button" className="thread__back" onClick={() => setSearchParams({})}>
              <ArrowLeft size={15} aria-hidden="true" /> All discussions
            </button>

            <header className="thread__head">
              <Avatar username={openThread.created_by} size={44} />
              <div className="thread__who">
                <strong>{openThread.created_by}</strong>
                <span className="gt-caption gt-muted">{timeAgo(openThread.created_at)}</span>
              </div>
              <Badge tone={TYPE_TONE[openThread.type] || 'neutral'}>
                {DISCUSSION_TYPES.find((t) => t.id === openThread.type)?.label || 'Question'}
              </Badge>
            </header>

            <h2 className="thread__title">{openThread.title}</h2>
            {openThread.location && (
              <p className="post__where"><MapPin size={13} aria-hidden="true" /> {openThread.location}</p>
            )}
            <p className="thread__text">{openThread.posts?.[0]?.message}</p>

            <div className="thread__acts">
              <button
                type="button"
                className={`post__act${(openThread.liked_by || []).includes(username) ? ' is-on' : ''}`}
                aria-pressed={(openThread.liked_by || []).includes(username)}
                onClick={() => toggleLike(openThread)}
              >
                <Heart size={15} fill={(openThread.liked_by || []).includes(username) ? 'currentColor' : 'none'} />
                {likeCount(openThread) > 0 ? likeCount(openThread) : 'Like'}
              </button>
              <span className="post__act post__act--static">
                <MessageCircle size={15} /> {replyCount(openThread)} {replyCount(openThread) === 1 ? 'reply' : 'replies'}
              </span>
            </div>

            <section className="thread__replies">
              {(openThread.posts || []).slice(1).map((post) => (
                <div key={post.id} className="reply">
                  <Avatar username={post.username} size={34} />
                  <div className="reply__body">
                    <div className="reply__who">
                      <strong>{post.username}</strong>
                      <span className="gt-caption gt-muted">{timeAgo(post.posted_at)}</span>
                    </div>
                    <p>{post.message}</p>
                  </div>
                </div>
              ))}

              {replyCount(openThread) === 0 && (
                <p className="gt-small gt-muted thread__empty">
                  No replies yet. If you have been, you could be the first.
                </p>
              )}
            </section>

            <form className="thread__compose" onSubmit={sendReply}>
              <Avatar username={username} size={34} />
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Share what you know…"
                aria-label="Your reply"
              />
              <Button type="submit" loading={sending} disabled={!reply.trim()}>
                <Send size={15} /> Reply
              </Button>
            </form>
          </article>
        ) : (
          /* ------------------------------------- list plus a composer */
          <div className="gd__discussions">
            <Card className="ask" padded>
              <form className="ask__form" onSubmit={startDiscussion}>
                <Field label="Start a discussion">
                  <Input
                    value={newPost.title}
                    onChange={(e) => setNewPost((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Best affordable hotels in Limbe?"
                  />
                </Field>
                <Field label="More detail">
                  <Textarea
                    value={newPost.message}
                    onChange={(e) => setNewPost((d) => ({ ...d, message: e.target.value }))}
                    placeholder="I'm looking for good and affordable hotels in Limbe. Any suggestions?"
                  />
                </Field>
                <div className="ask__row">
                  <Field label="Kind of post">
                    <Select value={newPost.type} onChange={(e) => setNewPost((d) => ({ ...d, type: e.target.value }))}>
                      {DISCUSSION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Where (optional)">
                    <Input value={newPost.location}
                      onChange={(e) => setNewPost((d) => ({ ...d, location: e.target.value }))}
                      placeholder="Limbe" />
                  </Field>
                </div>
                <div className="ask__actions">
                  <Button type="submit" loading={starting}><Send size={16} /> Post</Button>
                </div>
              </form>
            </Card>

            {discussions.length === 0 ? (
              <EmptyState
                icon={<MessageCircle size={22} />}
                title="No discussions in this group yet"
                body="Ask the first question — travellers who have been will answer."
              />
            ) : discussions.map((d) => (
              <Card key={d.id} className="post">
                <button type="button" className="post__link" onClick={() => setSearchParams({ d: d.id })}>
                  <header className="post__head">
                    <Avatar username={d.created_by} />
                    <div className="post__who">
                      <strong>{d.created_by}</strong>
                      <span className="gt-caption gt-muted">{timeAgo(d.created_at)}</span>
                    </div>
                    <Badge tone={TYPE_TONE[d.type] || 'neutral'}>
                      {DISCUSSION_TYPES.find((t) => t.id === d.type)?.label || 'Question'}
                    </Badge>
                  </header>
                  <h3 className="post__title">{d.title}</h3>
                  {d.posts?.[0]?.message && <p className="post__text">{d.posts[0].message}</p>}
                  {d.location && <p className="post__where"><MapPin size={13} aria-hidden="true" /> {d.location}</p>}
                </button>
                <footer className="post__foot">
                  <span className="post__act post__act--static">
                    <Heart size={15} fill={(d.liked_by || []).includes(username) ? 'currentColor' : 'none'} />
                    {likeCount(d) > 0 ? likeCount(d) : 'Like'}
                  </span>
                  <span className="post__act post__act--static">
                    <MessageCircle size={15} /> {replyCount(d)} {replyCount(d) === 1 ? 'reply' : 'replies'}
                  </span>
                </footer>
              </Card>
            ))}
          </div>
        ))}

        {/* ------------------------------------------------------ members */}
        {tab === 'members' && (
          <ul className="members">
            {members.map((member) => (
              <li key={member} className="member">
                <Avatar username={member} size={38} />
                <span>
                  <strong>{member}</strong>
                  {member === group.created_by && <span className="gt-caption gt-muted"> · created this group</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* -------------------------------------------------------- media */}
        {tab === 'media' && (
          media.length === 0 ? (
            <EmptyState icon={<ImageIcon size={22} />} title="No photos shared yet"
              body="Travel photographs shared to GlobeTrotter appear here." />
          ) : (
            <div className="photos photos--grid">
              {media.map((m) => (
                <figure key={m.id} className="photo">
                  <img src={m.url} alt={m.caption || 'Traveller photograph'} loading="lazy" decoding="async" />
                  {m.caption && <figcaption>{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )
        )}
      </div>
    </main>,
  );
}

export default function GroupDetail() {
  return <ToastProvider><GroupDetailInner /></ToastProvider>;
}

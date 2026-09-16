import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, ImageIcon, MapPin, MessageCircle, Plus, Send, Users,
} from 'lucide-react';
import {
  Badge, Button, Card, Chip, EmptyState, Field, Input, SectionHead,
  Select, Skeleton, Textarea, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import {
  DISCUSSION_TYPES, groupCover, initials, likeCount, replyCount, timeAgo, useCommunity,
} from '../lib/useCommunity';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './community.css';

/**
 * Community.
 *
 * One screen: ask something, read what other travellers asked, join a group.
 * Not a social network — there is no following, no algorithm and no profile
 * wall, because none of that helps somebody work out where to stay in Limbe.
 *
 * The feed is assembled from the groups' discussions, since the API serves
 * them per group. Posting requires membership, so the composer joins the
 * chosen group first rather than making that the traveller's problem.
 */

const FILTERS = [
  { id: 'all', label: 'All discussions' },
  { id: 'mine', label: 'My groups' },
  { id: 'unanswered', label: 'Unanswered' },
];

const TYPE_TONE = { question: 'primary', recommendation: 'success', experience: 'warning' };

/* ------------------------------------------------------------------ avatar */

export function Avatar({ username, size = 40 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials(username)}
    </span>
  );
}

/* -------------------------------------------------------------- feed item */

function DiscussionCard({ discussion, liked, onLike, canInteract }) {
  const opening = discussion.posts?.[0];
  const replies = replyCount(discussion);
  const likes = likeCount(discussion);

  return (
    <Card className="post">
      <Link to={`/community/${discussion.groupId}?d=${discussion.id}`} className="post__link">
        <header className="post__head">
          <Avatar username={discussion.created_by} />
          <div className="post__who">
            <strong>{discussion.created_by}</strong>
            <span className="gt-caption gt-muted">
              {timeAgo(discussion.created_at)} · {discussion.groupName}
            </span>
          </div>
          <Badge tone={TYPE_TONE[discussion.type] || 'neutral'}>
            {DISCUSSION_TYPES.find((t) => t.id === discussion.type)?.label || 'Question'}
          </Badge>
        </header>

        <h3 className="post__title">{discussion.title}</h3>
        {opening?.message && <p className="post__text">{opening.message}</p>}

        {discussion.location && (
          <p className="post__where"><MapPin size={13} aria-hidden="true" /> {discussion.location}</p>
        )}
      </Link>

      <footer className="post__foot">
        <button
          type="button"
          className={`post__act${liked ? ' is-on' : ''}`}
          aria-pressed={liked}
          disabled={!canInteract}
          onClick={() => onLike(discussion)}
        >
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
          {likes > 0 ? likes : 'Like'}
        </button>

        <Link to={`/community/${discussion.groupId}?d=${discussion.id}`} className="post__act">
          <MessageCircle size={15} />
          {replies > 0 ? `${replies} ${replies === 1 ? 'reply' : 'replies'}` : 'Reply'}
        </Link>
      </footer>
    </Card>
  );
}

/* ------------------------------------------------------------------- page */

function CommunityInner() {
  // Applies the chosen language to everything this page renders.
  const pageRef = useTranslatedPage();

  const navigate = useNavigate();
  const toast = useToast();
  const { token, username, isAuthenticated } = useAuth();
  const community = useCommunity(token, username);

  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', message: '', type: 'question', location: '', groupId: '' });
  const [posting, setPosting] = useState(false);
  const [media, setMedia] = useState([]);

  // A small strip of what travellers have shared. Fetched once, quietly.
  React.useEffect(() => {
    if (!token) return;
    api.listMedia({ token })
      .then((p) => setMedia((Array.isArray(p) ? p : p?.media || []).slice(0, 6)))
      .catch(() => {});
  }, [token]);

  const items = useMemo(() => community.filter(tab), [community, tab]);

  const submit = async (event) => {
    event.preventDefault();
    const groupId = draft.groupId || community.groups[0]?.id;
    if (!groupId) { toast.push('Create a group first — discussions live inside one.', 'info'); return; }
    if (!draft.title.trim() || !draft.message.trim()) {
      toast.push('A title and a message are both needed.', 'info');
      return;
    }

    setPosting(true);
    const result = await community.post(groupId, {
      title: draft.title.trim(),
      message: draft.message.trim(),
      type: draft.type,
      location: draft.location.trim(),
    });
    setPosting(false);

    if (result.ok) {
      toast.push('Posted to the community.', 'success');
      setDraft({ title: '', message: '', type: 'question', location: '', groupId });
      setOpen(false);
    } else {
      toast.push(result.reason, 'error');
    }
  };

  const onLike = async (discussion) => {
    const result = await community.toggleLike(discussion.groupId, discussion.id);
    if (!result.ok) toast.push(result.reason, 'error');
  };

  const onJoin = async (group) => {
    const result = await community.join(group.id);
    toast.push(result.ok ? `Joined ${group.name}.` : result.reason, result.ok ? 'success' : 'error');
  };

  const onLeave = async (group) => {
    const result = await community.leave(group.id);
    toast.push(result.ok ? `Left ${group.name}.` : result.reason, result.ok ? 'success' : 'error');
  };

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt community">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar community__main">
          <EmptyState
            icon={<Users size={22} />}
            title="Sign in to join the conversation"
            body="Ask questions, share advice and discover Cameroon with other travellers."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="gt community">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Explore</Button>}
      />

      <header className="community__head">
        <div className="gt-page">
          <h1 className="gt-h1">Community</h1>
          <p className="community__lede">
            Ask questions, share advice and discover Cameroon with other travellers.
          </p>
        </div>
      </header>

      <main className="gt-page gt-has-tabbar community__main">

        <Breadcrumbs />
        <div className="community__layout">
          <div className="community__feed">
            {/* ------------------------------------------------ composer */}
            <Card className="ask" padded>
              {!open ? (
                <button type="button" className="ask__prompt" onClick={() => setOpen(true)}>
                  <Avatar username={username} size={38} />
                  <span>What would you like to ask or share?</span>
                  <Plus size={18} aria-hidden="true" />
                </button>
              ) : (
                <form className="ask__form" onSubmit={submit}>
                  <Field label="Your question or headline">
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="First time visiting Kribi — what shouldn't I miss?"
                      autoFocus
                    />
                  </Field>

                  <Field label="Tell travellers a bit more">
                    <Textarea
                      value={draft.message}
                      onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
                      placeholder="I'm visiting for three days. Any recommendations for beaches, food and activities?"
                    />
                  </Field>

                  <div className="ask__row">
                    <Field label="Kind of post">
                      <Select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}>
                        {DISCUSSION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </Select>
                    </Field>

                    <Field label="Where (optional)">
                      <Input
                        value={draft.location}
                        onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                        placeholder="Kribi"
                      />
                    </Field>

                    <Field label="Group">
                      <Select
                        value={draft.groupId || community.groups[0]?.id || ''}
                        onChange={(e) => setDraft((d) => ({ ...d, groupId: e.target.value }))}
                      >
                        {community.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </Select>
                    </Field>
                  </div>

                  <div className="ask__actions">
                    <Button type="submit" loading={posting}><Send size={16} /> Post</Button>
                    <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  </div>

                  <p className="ask__note">
                    Posts live inside a group. You will be added to the one you
                    choose if you are not in it already.
                  </p>
                </form>
              )}
            </Card>

            {/* ------------------------------------------------- filters */}
            <div className="community__filters" role="group" aria-label="Filter discussions">
              {FILTERS.map((f) => (
                <Chip key={f.id} active={tab === f.id} onClick={() => setTab(f.id)}>{f.label}</Chip>
              ))}
            </div>

            {/* ---------------------------------------------------- feed */}
            {community.loading ? (
              <div className="gt-stack gt-gap-4">
                {[0, 1, 2].map((i) => (
                  <Card key={i} padded><Skeleton height="1.2rem" width="55%" /><div style={{ height: 8 }} /><Skeleton height="0.9rem" /><div style={{ height: 6 }} /><Skeleton height="0.9rem" width="75%" /></Card>
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<MessageCircle size={22} />}
                title={tab === 'all' ? 'No discussions yet' : 'Nothing here yet'}
                body={tab === 'all'
                  ? 'Be the first to ask something — travellers who have been will answer.'
                  : 'Try another filter, or ask something of your own.'}
                action={<Button size="sm" onClick={() => setOpen(true)}>Ask the community</Button>}
              />
            ) : (
              <div className="community__posts">
                {items.map((d) => (
                  <DiscussionCard
                    key={`${d.groupId}-${d.id}`}
                    discussion={d}
                    liked={(d.liked_by || []).includes(username)}
                    onLike={onLike}
                    canInteract
                  />
                ))}
              </div>
            )}
          </div>

          {/* ---------------------------------------------------- sidebar */}
          <aside className="community__side">
            <section>
              <SectionHead title="Popular groups" />
              <div className="groups">
                {community.groups.length === 0 ? (
                  <p className="gt-small gt-muted">No groups yet.</p>
                ) : community.groups.slice(0, 5).map((group) => {
                  const cover = groupCover(group);
                  const members = (group.members || []).length;
                  const joined = community.isMember(group.id);
                  return (
                    <Card key={group.id} className="group">
                      <Link to={`/community/${group.id}`} className="group__media">
                        {cover ? (
                          <>
                            <img src={cover.url} alt="" loading="lazy" decoding="async" />
                            <span className="group__scrim" />
                            {/* The photograph is of the city, not the group. */}
                            <span className="group__citytag">{cover.city} · city photo</span>
                          </>
                        ) : <span className="group__placeholder" aria-hidden="true"><Users size={20} /></span>}
                        <span className="group__name">{group.name}</span>
                      </Link>
                      <div className="group__foot">
                        <span className="gt-caption gt-muted">
                          <Users size={12} aria-hidden="true" /> {members} member{members === 1 ? '' : 's'}
                        </span>
                        {joined
                          ? <Button size="sm" variant="ghost" onClick={() => onLeave(group)}>Leave</Button>
                          : <Button size="sm" variant="secondary" onClick={() => onJoin(group)}>Join</Button>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>

            {media.length > 0 && (
              <section>
                <SectionHead title="Recent travel photos" />
                <div className="photos">
                  {media.map((m) => (
                    <figure key={m.id} className="photo">
                      <img src={m.url} alt={m.caption || 'Traveller photograph'} loading="lazy" decoding="async" />
                    </figure>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Community() {
  return <ToastProvider><CommunityInner /></ToastProvider>;
}

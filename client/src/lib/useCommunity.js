import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';

/**
 * The community: groups, and the discussions inside them.
 *
 * There is no feed endpoint — a discussion belongs to a group, and the API
 * serves them per group. So the feed is assembled here: fetch the groups, then
 * their discussions, and merge into one list newest first. With a handful of
 * groups that is a handful of requests; if the community grows past that, the
 * right answer is a feed endpoint on the server, not paging logic in the
 * browser.
 */

/** Cities with a photograph in the catalogue, for group cover images. */
const CITY_IMAGES = [
  'yaounde', 'douala', 'kribi', 'limbe', 'buea',
  'bamenda', 'bafoussam', 'garoua', 'maroua', 'ngaoundere', 'bertoua',
];

/**
 * A cover photograph for a group, chosen by the city in its name.
 *
 * "Kribi Travelers" gets the Kribi photograph. It is a picture of the city,
 * not of the group, which is why the card labels it as one — the same rule the
 * catalogue pages follow for contextual images.
 */
export function groupCover(group) {
  const haystack = `${group?.name || ''} ${group?.description || ''}`.toLowerCase();
  const city = CITY_IMAGES.find((name) => haystack.includes(name));
  return city ? { url: `/images/destinations/${city}.jpg`, city } : null;
}

export const DISCUSSION_TYPES = [
  { id: 'question', label: 'Question' },
  { id: 'recommendation', label: 'Recommendation' },
  { id: 'experience', label: 'Experience' },
];

/** Replies, excluding the opening post, which is the discussion itself. */
export const replyCount = (discussion) => Math.max((discussion?.posts?.length || 1) - 1, 0);

export const likeCount = (discussion) => (discussion?.liked_by || []).length;

export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Initials for the avatar, since the API carries no profile photograph. */
export const initials = (username = '') =>
  username.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '').join('') || '?';

export function useCommunity(token, username) {
  const [groups, setGroups] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    if (!token) { setLoading(false); return; }
    try {
      const groupPayload = await api.listGroups({ token, signal });
      const list = Array.isArray(groupPayload) ? groupPayload : (groupPayload?.groups || []);
      setGroups(list);

      // Each group's discussions, tagged with the group they came from so the
      // feed can link back and the reply call knows where to post.
      const perGroup = await Promise.all(list.map(async (group) => {
        const source = group.discussions
          ? group.discussions
          : await api.listDiscussions(group.id, { token, signal })
            .then((p) => (Array.isArray(p) ? p : p?.discussions || []))
            .catch(() => []);
        return source.map((d) => ({ ...d, groupId: group.id, groupName: group.name }));
      }));

      setDiscussions(
        perGroup.flat().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      );
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not load the community.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const myGroupIds = useMemo(
    () => new Set(groups.filter((g) => (g.members || []).includes(username)).map((g) => g.id)),
    [groups, username],
  );

  /**
   * The three filters.
   *
   * "Cameroon" is not among them: every group and every place in this
   * application is Cameroonian, so it would filter nothing. "Unanswered" earns
   * its place instead — it is the one view that helps somebody waiting for a
   * reply.
   */
  const filter = useCallback((which) => {
    if (which === 'mine') return discussions.filter((d) => myGroupIds.has(d.groupId));
    if (which === 'unanswered') return discussions.filter((d) => replyCount(d) === 0);
    return discussions;
  }, [discussions, myGroupIds]);

  const isMember = useCallback((groupId) => myGroupIds.has(groupId), [myGroupIds]);

  const join = useCallback(async (groupId) => {
    try {
      await api.joinGroup(groupId, { token });
      await load();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }, [token, load]);

  const leave = useCallback(async (groupId) => {
    try {
      await api.leaveGroup(groupId, { token });
      await load();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }, [token, load]);

  /** Post a discussion, joining the group first if that is what is missing. */
  const post = useCallback(async (groupId, fields) => {
    try {
      if (!myGroupIds.has(groupId)) await api.joinGroup(groupId, { token });
      const result = await api.createDiscussion(groupId, fields, { token });
      await load();
      return { ok: true, discussion: result?.discussion };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }, [token, myGroupIds, load]);

  const toggleLike = useCallback(async (groupId, discussionId) => {
    // Optimistic: the heart responds now and rolls back if the server refuses.
    const flip = (list) => list.map((d) => {
      if (d.id !== discussionId) return d;
      const liked = (d.liked_by || []).includes(username);
      return {
        ...d,
        liked_by: liked
          ? (d.liked_by || []).filter((u) => u !== username)
          : [...(d.liked_by || []), username],
      };
    });

    setDiscussions(flip);
    try {
      await api.likeDiscussion(groupId, discussionId, { token });
      return { ok: true };
    } catch (err) {
      setDiscussions(flip);
      return { ok: false, reason: err.message };
    }
  }, [token, username]);

  return {
    groups, discussions, loading, error,
    filter, isMember, join, leave, post, toggleLike,
    reload: load,
  };
}

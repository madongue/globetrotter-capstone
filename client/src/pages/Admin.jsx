import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Search, Shield, ShieldOff, Users, X } from 'lucide-react';
import {
  Badge, Button, EmptyState, SearchInput, SectionHead, Skeleton, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import { Avatar } from './Community';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './admin.css';

/**
 * The administrator's screen.
 *
 * Three jobs, in the order they are needed: see the platform's numbers, clear
 * the review queue, manage who is an administrator.
 *
 * Every figure comes from GET /admin/stats and every action from an endpoint
 * that already existed -- this page adds no analytics of its own. The server
 * refuses all of them with 403 for a non-admin, but the page checks the role
 * first so that being refused is never how someone finds out they are not
 * allowed in.
 */

/** The twelve metrics, grouped by the question they answer. */
/** Filled in by the geocoder when a location changes, not typed by anyone. */
const DERIVED_FIELDS = ['region', 'division', 'subdivision', 'city', 'quarter', 'country', 'country_code', 'continent'];

const METRIC_GROUPS = [
  {
    label: 'People',
    metrics: [
      { key: 'total_users', label: 'Registered accounts' },
      { key: 'active_today', label: 'Active today' },
      { key: 'total_admins', label: 'Administrators' },
      { key: 'total_groups', label: 'Community groups' },
    ],
  },
  {
    label: 'Planning',
    metrics: [
      { key: 'total_itineraries', label: 'Itineraries created' },
      { key: 'public_itineraries', label: 'Shared publicly' },
      { key: 'total_media', label: 'Photos posted' },
    ],
  },
  {
    label: 'Catalogue',
    metrics: [
      { key: 'total_places', label: 'Places' },
      { key: 'total_hotels', label: 'Hotels' },
      { key: 'total_activities', label: 'Activities' },
    ],
  },
];

function AdminInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, isAuthenticated } = useAuth();

  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState('');
  const [busyOn, setBusyOn] = useState('');

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const profile = await api.getProfile({ token });
      setMe(profile);
      if (profile?.role !== 'admin') { setDenied(true); setLoading(false); return; }

      const [statsPayload, userList, requestList, groupList] = await Promise.all([
        api.adminStats({ token }),
        api.adminUsers({ token }),
        api.listPlaceRequests({ token }),
        api.listPendingGroups({ token }).catch(() => []),
      ]);
      setStats(statsPayload);
      setUsers(Array.isArray(userList) ? userList : []);
      setRequests(Array.isArray(requestList) ? requestList : []);
      setGroups(Array.isArray(groupList) ? groupList : []);
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(
    () => requests.filter((item) => item.status === 'pending'),
    [requests],
  );

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? users.filter((user) => (user.username || '').toLowerCase().includes(needle))
      : users;
    // Administrators first, then alphabetical: the rows an administrator is
    // looking for are the ones with power.
    return [...rows].sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      return (a.username || '').localeCompare(b.username || '');
    });
  }, [users, query]);

  const changeRole = async (user, role) => {
    setBusyOn(user.username);
    try {
      await api.setUserRole(user.username, role, { token });
      setUsers((current) => current.map(
        (row) => (row.username === user.username ? { ...row, role } : row),
      ));
      // The admin count on the page would otherwise disagree with the table.
      setStats((current) => (current ? {
        ...current,
        total_admins: current.total_admins + (role === 'admin' ? 1 : -1),
      } : current));
      toast.push(
        role === 'admin'
          ? `${user.username} is now an administrator.`
          : `${user.username} is now a regular user.`,
      );
    } catch (error) {
      toast.push(error.message || 'Could not change the role.', 'error');
    } finally {
      setBusyOn('');
    }
  };

  const decide = async (submission, approve) => {
    setBusyOn(submission.id);
    try {
      if (approve) {
        await api.approvePlaceRequest(submission.id, { token });
      } else {
        await api.rejectPlaceRequest(submission.id, '', { token });
      }
      setRequests((current) => current.map((item) => (
        item.id === submission.id
          ? { ...item, status: approve ? 'approved' : 'rejected' }
          : item
      )));
      // An approval adds a row to the catalogue, so the counts above are now
      // stale; re-reading is cheaper than modelling which one moved.
      api.adminStats({ token }).then(setStats).catch(() => {});
      toast.push(approve ? `${submission.name} added to the catalogue.` : 'Suggestion rejected.');
    } catch (error) {
      toast.push(error.message || 'Could not record the decision.', 'error');
    } finally {
      setBusyOn('');
    }
  };

  const decideGroup = async (group, approve) => {
    setBusyOn(group.id);
    try {
      if (approve) await api.approveGroup(group.id, '', { token });
      else await api.rejectGroup(group.id, '', { token });
      setGroups((current) => current.filter((item) => item.id !== group.id));
      // An approved group joins the community count above.
      api.adminStats({ token }).then(setStats).catch(() => {});
      toast.push(approve ? `${group.name} is now live.` : `${group.name} was not approved.`);
    } catch (error) {
      toast.push(error.message || 'Could not record the decision.', 'error');
    } finally {
      setBusyOn('');
    }
  };

  /* ------------------------------------------------------------- guards */

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt admin">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar admin__main">
          <EmptyState
            icon={<Shield size={22} />}
            title="Administrators only"
            body="Sign in with an administrator account to open this page."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  if (denied) {
    return (
      <div ref={pageRef} className="gt admin">
        <TopBar isAuthenticated />
        <main className="gt-page gt-has-tabbar admin__main">
          <EmptyState
            icon={<ShieldOff size={22} />}
            title="You do not have administrator access"
            body="An existing administrator can grant it from this same screen."
            action={<Button size="sm" onClick={() => navigate('/dashboard')}>Back to dashboard</Button>}
          />
        </main>
        <TabBar isAuthenticated />
      </div>
    );
  }

  return (
    <div ref={pageRef} className="gt admin">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/dashboard')}>Dashboard</Button>}
      />

      <main className="gt-page gt-has-tabbar admin__main">

        <Breadcrumbs />
        <header className="admin__head">
          <h1 className="admin__title">
            <Shield size={22} aria-hidden="true" /> Admin dashboard
          </h1>
          <p className="admin__lede">
            Platform figures, the suggestion queue and account roles. Everything
            here is counted from live data — nothing is sampled or estimated.
          </p>
        </header>

        {/* ------------------------------------------------------ analytics */}
        <section>
          <SectionHead title="Platform analytics" />
          {loading ? <Skeleton height="8rem" /> : (
            <>
              {METRIC_GROUPS.map((group) => (
                <div className="admin__group" key={group.label}>
                  <p className="admin__group-label">{group.label}</p>
                  <div className="admin__metrics">
                    {group.metrics.map((metric) => (
                      <div className="metric" key={metric.key}>
                        <span className="metric__value">{stats?.[metric.key] ?? '—'}</span>
                        <span className="metric__label">{metric.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="admin__group">
                <p className="admin__group-label">Review queue</p>
                <div className="admin__metrics">
                  <div className={`metric${pending.length > 0 ? ' metric--attention' : ''}`}>
                    <span className="metric__value">{stats?.pending_place_requests ?? '—'}</span>
                    <span className="metric__label">Pending suggestions</span>
                    <span className="metric__note">
                      of {stats?.total_place_requests ?? 0} submitted in total
                    </span>
                  </div>
                  <div className={`metric${groups.length > 0 ? ' metric--attention' : ''}`}>
                    <span className="metric__value">{loading ? '—' : groups.length}</span>
                    <span className="metric__label">Groups awaiting approval</span>
                    <span className="metric__note">
                      of {stats?.total_groups ?? 0} in the community
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---------------------------------------------------------- queue */}
        <section>
          <SectionHead
            title="Suggestions awaiting review"
            subtitle="Approving one adds it to the catalogue immediately."
          />
          {loading ? <Skeleton height="6rem" /> : pending.length === 0 ? (
            <EmptyState
              icon={<Check size={20} />}
              title="Nothing waiting"
              body="Every suggestion travellers sent in has been reviewed."
            />
          ) : (
            <div className="admin__queue">
              {pending.map((submission) => (
                <article className="review" key={submission.id}>
                  <div className="review__what">
                    <h3 className="review__name">
                      {submission.mode === 'edit'
                        ? <>Correction · {submission.target_name || submission.name}</>
                        : submission.name}
                    </h3>
                    <p className="review__meta">
                      <Badge tone={submission.mode === 'edit' ? 'warning' : 'primary'}>
                        {submission.mode === 'edit' ? 'Edit' : 'New'}
                      </Badge>
                      <span>{submission.location}</span>
                      <span>{submission.type}</span>
                      <span>by {submission.submitted_by}</span>
                      {submission.submitted_at && (
                        <span>{new Date(submission.submitted_at).toLocaleDateString()}</span>
                      )}
                    </p>

                    {/* A correction is only readable as a before/after. The
                        server stores just the fields that differ, so this is
                        the whole of what approving would change. */}
                    {submission.mode === 'edit' && submission.changes && (
                      <dl className="review__diff">
                        {Object.entries(submission.changes)
                          // The geography fields are derived from a changed
                          // location, not typed by the submitter.
                          .filter(([field]) => !DERIVED_FIELDS.includes(field))
                          .map(([field, value]) => (
                            <div className="review__change" key={field}>
                              <dt>{field.replace(/_/g, ' ')}</dt>
                              <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                            </div>
                          ))}
                      </dl>
                    )}

                    {submission.reason && (
                      <p className="review__desc"><strong>Reason given:</strong> {submission.reason}</p>
                    )}
                    {submission.description && submission.mode !== 'edit' && (
                      <p className="review__desc">{submission.description}</p>
                    )}
                  </div>
                  <div className="review__actions">
                    <Button
                      size="sm"
                      disabled={busyOn === submission.id}
                      onClick={() => decide(submission, true)}
                    >
                      <Check size={14} aria-hidden="true" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyOn === submission.id}
                      onClick={() => decide(submission, false)}
                    >
                      <X size={14} aria-hidden="true" /> Reject
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* --------------------------------------------------- group queue */}
        <section>
          <SectionHead
            title="Groups awaiting approval"
            subtitle="A group is a space other travellers are invited into, so someone reads it first. Your own groups go live without this step."
          />
          {loading ? <Skeleton height="6rem" /> : groups.length === 0 ? (
            <EmptyState
              icon={<Users size={20} />}
              title="No groups waiting"
              body="Every group travellers have asked for has been reviewed."
            />
          ) : (
            <div className="admin__queue">
              {groups.map((group) => (
                <article className="review" key={group.id}>
                  <div className="review__what">
                    <h3 className="review__name">{group.name}</h3>
                    <p className="review__meta">
                      <Badge tone="warning">Group</Badge>
                      <span>asked for by {group.created_by}</span>
                      {group.created_at && (
                        <span>{new Date(group.created_at).toLocaleDateString()}</span>
                      )}
                    </p>
                    {group.description && (
                      <p className="review__desc">{group.description}</p>
                    )}
                  </div>
                  <div className="review__actions">
                    <Button
                      size="sm"
                      disabled={busyOn === group.id}
                      onClick={() => decideGroup(group, true)}
                    >
                      <Check size={14} aria-hidden="true" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyOn === group.id}
                      onClick={() => decideGroup(group, false)}
                    >
                      <X size={14} aria-hidden="true" /> Reject
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------- accounts */}
        <section>
          <SectionHead
            title={`Accounts (${users.length})`}
            subtitle="An administrator cannot remove their own administrator role."
          />
          <div className="admin__search">
            <SearchInput
              icon={<Search size={16} />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an account"
              aria-label="Find an account"
            />
          </div>

          {loading ? <Skeleton height="8rem" /> : visibleUsers.length === 0 ? (
            <EmptyState title="No account matches that" body="Try a different spelling." />
          ) : (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Role</th>
                    <th scope="col">Interests</th>
                    <th scope="col"><span className="gt-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => {
                    const isSelf = user.username === me?.username;
                    return (
                      <tr key={user.id || user.username}>
                        <td>
                          <span className="admin__who">
                            <Avatar username={user.username} src={user.avatar_url} size={30} />
                            <strong>{user.username}</strong>
                            {user.google_linked && <Badge tone="neutral">Google</Badge>}
                          </span>
                        </td>
                        <td>
                          {user.role === 'admin'
                            ? <Badge tone="primary">Administrator</Badge>
                            : <Badge tone="neutral">User</Badge>}
                        </td>
                        <td className="admin__tags">
                          {(user.preferences || []).join(', ') || '—'}
                        </td>
                        <td className="admin__row-actions">
                          {isSelf ? (
                            <span className="admin__self">That is you</span>
                          ) : user.role === 'admin' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyOn === user.username}
                              onClick={() => changeRole(user, 'user')}
                            >
                              Remove admin
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyOn === user.username}
                              onClick={() => changeRole(user, 'admin')}
                            >
                              Make admin
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Admin() {
  return <ToastProvider><AdminInner /></ToastProvider>;
}

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lightbulb, PencilLine } from 'lucide-react';
import {
  Badge, Button, EmptyState, Field, Input, Select, SectionHead, Skeleton,
  Textarea, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './suggest.css';

/**
 * Suggest a place, or correct one that is already listed.
 *
 * Two jobs on one screen because they queue in the same place and are reviewed
 * by the same person. Which one is showing is decided by the URL: `?edit=<id>`
 * corrects that entry, no parameter adds a new one. That means "suggest a
 * correction" on a place page is an ordinary link, and the browser's back
 * button behaves.
 *
 * Adding requires name, location and cost, which is what the server requires.
 * Correcting requires only that something actually differs -- the server
 * records the difference against the live record and drops anything unchanged,
 * so the form can send every field and let it decide.
 */

const TYPES = [
  { value: 'places', label: 'Place to visit' },
  { value: 'hotels', label: 'Hotel' },
  { value: 'activities', label: 'Activity' },
];

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'error' };

const BLANK = { name: '', location: '', cost: '', description: '' };

function SuggestInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, username, isAuthenticated } = useAuth();
  const [params, setParams] = useSearchParams();

  const targetId = params.get('edit') || '';
  const correcting = Boolean(targetId);

  const [type, setType] = useState(params.get('type') || 'places');
  const [form, setForm] = useState(BLANK);
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState(null);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [busy, setBusy] = useState(false);

  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);

  const set = (field) => (event) => setForm((c) => ({ ...c, [field]: event.target.value }));

  /* ------------------------------------------------- the entry being fixed */

  useEffect(() => {
    if (!targetId) { setTarget(null); setForm(BLANK); return undefined; }
    let cancelled = false;
    setLoadingTarget(true);

    api.getPlace(targetId, { token })
      .then((payload) => {
        if (cancelled) return;
        const place = payload?.place || payload;
        setTarget(place);
        // Prefilled with what is on record, so the form shows what is being
        // changed *from* and an untouched field cannot be read as a deletion.
        setForm({
          name: place?.name || '',
          location: place?.location || '',
          cost: String(place?.cost ?? place?.cost_per_night ?? ''),
          description: place?.description || '',
        });
      })
      .catch(() => { if (!cancelled) setTarget(null); })
      .finally(() => { if (!cancelled) setLoadingTarget(false); });

    return () => { cancelled = true; };
  }, [targetId, token]);

  /* ------------------------------------------------------ own submissions */

  const load = useCallback(() => {
    if (!token) { setLoading(false); return; }
    api.listPlaceRequests({ token })
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : (payload?.requests || []);
        // An administrator gets the whole queue from this endpoint; this page
        // is about your own submissions either way.
        setMine(list.filter((item) => !username || item.submitted_by === username));
      })
      .catch(() => setMine([]))
      .finally(() => setLoading(false));
  }, [token, username]);

  useEffect(() => { load(); }, [load]);

  /* ------------------------------------------------------------- sending */

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const costField = type === 'hotels' ? 'cost_per_night' : 'cost';

    try {
      const created = correcting
        ? await api.submitPlaceCorrection({
          targetId,
          type,
          reason: reason.trim(),
          name: form.name.trim(),
          location: form.location.trim(),
          description: form.description.trim(),
          [costField]: form.cost === '' ? undefined : Number(form.cost),
        }, { token })
        : await api.submitPlaceRequest({
          type,
          name: form.name.trim(),
          location: form.location.trim(),
          description: form.description.trim(),
          [costField]: Number(form.cost),
        }, { token });

      setMine((current) => [created, ...current]);
      setForm(BLANK);
      setReason('');
      if (correcting) {
        // Leaving the parameter behind would reload the entry and refill the
        // form, which reads as though the correction had not been sent.
        setParams({}, { replace: true });
      }
      toast.push(correcting
        ? 'Correction sent for review.'
        : 'Sent for review. You will see it below.');
    } catch (error) {
      toast.push(error.message || 'Could not send that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt suggest">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar suggest__main">
          <EmptyState
            icon={<Lightbulb size={22} />}
            title="Sign in to suggest a place"
            body="Suggestions are reviewed before they join the catalogue, so they need an account."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  const costLabel = type === 'hotels' ? 'Cost per night (FCFA)' : 'Typical cost (FCFA)';
  const canSend = correcting
    ? !busy && !loadingTarget && Boolean(target)
    : !busy && form.name.trim() && form.location.trim() && form.cost !== '';

  return (
    <div ref={pageRef} className="gt suggest">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Explore</Button>}
      />

      <main className="gt-page gt-has-tabbar suggest__main">
        <Breadcrumbs />
        <header className="suggest__head">
          <h1 className="suggest__title">
            {correcting ? 'Correct an entry' : 'Suggest a place'}
          </h1>
          <p className="suggest__lede">
            {correcting
              ? 'Change what is wrong and say why. An administrator reviews the correction before it goes live, and only the fields you actually change are applied.'
              : 'Know somewhere in Cameroon we have missed? Send it in. An administrator reviews each suggestion, and an approved one joins the catalogue for everyone.'}
          </p>
          {correcting && (
            <p className="suggest__switch">
              <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
                Add a new place instead
              </Button>
            </p>
          )}
        </header>

        <div className="suggest__cols">
          {/* ---------------------------------------------------------- form */}
          <form className="suggest__form" onSubmit={submit}>
            {correcting && (
              <p className="suggest__target">
                <PencilLine size={15} aria-hidden="true" />
                {loadingTarget
                  ? 'Loading the entry…'
                  : target
                    ? <>Correcting <strong>{target.name}</strong></>
                    : 'That entry could not be loaded.'}
              </p>
            )}

            {!correcting && (
              <Field label="What is it?">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Name">
              <Input
                value={form.name}
                onChange={set('name')}
                placeholder="Ekom Nkam Waterfalls"
                required={!correcting}
              />
            </Field>

            <div className="suggest__row suggest__row--two">
              <Field label="Where" hint="Town or city, and region if you know it">
                <Input
                  value={form.location}
                  onChange={set('location')}
                  placeholder="Melong, Littoral"
                  required={!correcting}
                />
              </Field>
              <Field label={costLabel}>
                <Input
                  type="number"
                  min="0"
                  step="500"
                  value={form.cost}
                  onChange={set('cost')}
                  placeholder="5000"
                  required={!correcting}
                />
              </Field>
            </div>

            <Field label="Description" hint="Optional. What makes it worth the trip?">
              <Textarea
                rows={4}
                value={form.description}
                onChange={set('description')}
                maxLength={600}
                placeholder="A pair of falls on the Nkam river, reachable by road from Melong."
              />
            </Field>

            {correcting && (
              <Field label="Why is this wrong?" hint="Helps the reviewer decide quickly.">
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={400}
                  placeholder="The entry fee went up this season — it is 5,000 now, not 3,000."
                />
              </Field>
            )}

            <Button type="submit" disabled={!canSend}>
              {busy ? 'Sending…' : correcting ? 'Send correction' : 'Send for review'}
            </Button>
          </form>

          {/* ---------------------------------------------------- submissions */}
          <section>
            <SectionHead
              title="Your suggestions"
              subtitle="What you have sent in, and where each one stands."
            />
            {loading ? <Skeleton height="6rem" /> : mine.length === 0 ? (
              <EmptyState
                icon={<Lightbulb size={20} />}
                title="Nothing sent yet"
                body="Your suggestions and corrections will appear here with their review status."
              />
            ) : (
              <div className="suggest__list">
                {mine.map((item) => (
                  <article className="sub" key={item.id}>
                    <div className="sub__text">
                      <h3 className="sub__name">
                        {item.mode === 'edit' ? `Correction · ${item.target_name || item.name}` : item.name}
                      </h3>
                      <p className="sub__meta">
                        <span>{item.location}</span>
                        <span>{item.type}</span>
                        {item.submitted_at && (
                          <span>{new Date(item.submitted_at).toLocaleDateString()}</span>
                        )}
                      </p>
                      {item.mode === 'edit' && item.changes && (
                        <p className="sub__note">
                          Changes: {Object.keys(item.changes)
                            .filter((f) => !['region', 'division', 'subdivision', 'city', 'quarter', 'country', 'country_code', 'continent'].includes(f))
                            .join(', ')}
                        </p>
                      )}
                      {item.review_note && <p className="sub__note">{item.review_note}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[item.status] || 'neutral'}>{item.status}</Badge>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Suggest() {
  return <ToastProvider><SuggestInner /></ToastProvider>;
}

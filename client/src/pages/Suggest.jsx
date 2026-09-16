import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import {
  Badge, Button, EmptyState, Field, Input, Select, SectionHead, Skeleton,
  Textarea, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './suggest.css';

/**
 * Suggest somewhere the catalogue is missing.
 *
 * Three fields are required by the server -- name, location and cost -- and
 * the cost field it reads depends on the type: hotels carry `cost_per_night`,
 * everything else `cost`. That is handled here rather than asking the person
 * to know it.
 *
 * Submissions are queued as `pending` and appear on the admin screen for
 * review. This page shows the person their own submissions and what became of
 * them, so sending one in is not the last they hear of it.
 */

const TYPES = [
  { value: 'places', label: 'Place to visit' },
  { value: 'hotels', label: 'Hotel' },
  { value: 'activities', label: 'Activity' },
];

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'error' };

function SuggestInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, username, isAuthenticated } = useAuth();

  const [type, setType] = useState('places');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [cost, setCost] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const costField = type === 'hotels' ? 'cost_per_night' : 'cost';
      const created = await api.submitPlaceRequest({
        type,
        name: name.trim(),
        location: location.trim(),
        description: description.trim(),
        [costField]: Number(cost),
      }, { token });

      setMine((current) => [created, ...current]);
      setName(''); setLocation(''); setCost(''); setDescription('');
      toast.push('Sent for review. You will see it below.');
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

  return (
    <div ref={pageRef} className="gt suggest">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Explore</Button>}
      />

      <main className="gt-page gt-has-tabbar suggest__main">
        <header className="suggest__head">
          <h1 className="suggest__title">Suggest a place</h1>
          <p className="suggest__lede">
            Know somewhere in Cameroon we have missed? Send it in. An
            administrator reviews each suggestion, and an approved one joins the
            catalogue for everyone.
          </p>
        </header>

        <div className="suggest__cols">
          {/* ---------------------------------------------------------- form */}
          <form className="suggest__form" onSubmit={submit}>
            <Field label="What is it?">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </Field>

            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ekom Nkam Waterfalls"
                required
              />
            </Field>

            <div className="suggest__row suggest__row--two">
              <Field label="Where" hint="Town or city, and region if you know it">
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Melong, Littoral"
                  required
                />
              </Field>
              <Field label={costLabel}>
                <Input
                  type="number"
                  min="0"
                  step="500"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="5000"
                  required
                />
              </Field>
            </div>

            <Field label="Description" hint="Optional. What makes it worth the trip?">
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={600}
                placeholder="A pair of falls on the Nkam river, reachable by road from Melong."
              />
            </Field>

            <Button
              type="submit"
              disabled={busy || !name.trim() || !location.trim() || cost === ''}
            >
              {busy ? 'Sending…' : 'Send for review'}
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
                body="Your suggestions will appear here with their review status."
              />
            ) : (
              <div className="suggest__list">
                {mine.map((item) => (
                  <article className="sub" key={item.id}>
                    <div className="sub__text">
                      <h3 className="sub__name">{item.name}</h3>
                      <p className="sub__meta">
                        <span>{item.location}</span>
                        <span>{item.type}</span>
                        {item.submitted_at && (
                          <span>{new Date(item.submitted_at).toLocaleDateString()}</span>
                        )}
                      </p>
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

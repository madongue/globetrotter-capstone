import React, { useState } from 'react';
import { Bookmark, Compass, Heart, MapPin, Search, Sparkles } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardMedia, CardMeta, CardTitle, Chip, Dialog,
  EmptyState, Field, Grid, Input, SearchInput, SectionHead, Select, Skeleton,
  SkeletonCards, Textarea, ToastProvider, useToast,
} from '../components/ui';
import { Brand, TabBar, TopBar } from '../components/Navigation';
import './design-system.css';

/**
 * The living style guide, at /design.
 *
 * Every primitive rendered once, from the real components, so the design
 * system can be reviewed as a thing you look at rather than a file you read.
 * When a token changes, this page changes with it.
 *
 * It is also the first page component in the codebase, and exists partly to
 * prove the shape works: a self-contained page, mounted by the router, that
 * imports what it needs and holds its own state. Phase B builds Home, Explore
 * and Place Details the same way.
 */

const SWATCHES = [
  ['Primary', '--gt-primary'],
  ['Primary hover', '--gt-primary-hover'],
  ['Secondary', '--gt-secondary'],
  ['Dark', '--gt-dark'],
  ['Accent', '--gt-accent'],
  ['Surface', '--gt-surface'],
];

const STATUS = [
  ['Success', '--gt-success'],
  ['Warning', '--gt-warning'],
  ['Error', '--gt-error'],
  ['Info', '--gt-info'],
  ['Gray', '--gt-gray'],
];

const SPACING = [
  ['1', '4px'], ['2', '8px'], ['3', '12px'],
  ['4', '16px'], ['5', '24px'], ['6', '32px'], ['7', '48px'],
];

const RADII = [
  ['xs', '4px'], ['sm', '8px'], ['md', '12px'], ['lg', '16px'], ['xl', '24px'],
];

function Swatch({ name, token }) {
  return (
    <div className="ds-swatch">
      <span className="ds-swatch__chip" style={{ background: `var(${token})` }} />
      <div>
        <strong>{name}</strong>
        <code>{token}</code>
      </div>
    </div>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="gt-row gt-gap-2" style={{ flexWrap: 'wrap' }}>
      <Button size="sm" variant="secondary" onClick={() => toast.push('Saved to your places.', 'success')}>Success</Button>
      <Button size="sm" variant="secondary" onClick={() => toast.push('Could not reach the server.', 'error')}>Error</Button>
      <Button size="sm" variant="secondary" onClick={() => toast.push('Building your trip…', 'info')}>Info</Button>
    </div>
  );
}

export default function DesignSystem() {
  const [category, setCategory] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <ToastProvider>
      <div className="gt ds">
        <TopBar
          isAuthenticated
          actions={<Button size="sm">Build my trip</Button>}
        />

        <main className="gt-page gt-has-tabbar">
          <header className="ds-hero">
            <p className="gt-label">Design system</p>
            <h1 className="gt-h1">Explore Cameroon.<br />Create Memories.</h1>
            <p className="gt-muted">
              Every primitive the interface is built from, rendered from the real
              components. More than a trip — it&rsquo;s a connection.
            </p>
          </header>

          {/* ------------------------------------------------------ colour */}
          <section className="ds-section">
            <SectionHead title="Colour" subtitle="Green carries Cameroon; gold is the flag's star, used once per screen at most." />
            <div className="ds-swatches">
              {SWATCHES.map(([n, t]) => <Swatch key={t} name={n} token={t} />)}
            </div>
            <p className="gt-label" style={{ marginTop: 'var(--gt-space-5)' }}>Status — never reused as a brand colour</p>
            <div className="ds-swatches">
              {STATUS.map(([n, t]) => <Swatch key={t} name={n} token={t} />)}
            </div>
          </section>

          {/* -------------------------------------------------- typography */}
          <section className="ds-section">
            <SectionHead title="Typography" subtitle="Poppins, one scale, used consistently." />
            <div className="gt-stack gt-gap-3">
              <div className="ds-type"><span className="gt-label">H1 · 48 · Bold</span><p className="gt-h1">Explore Cameroon</p></div>
              <div className="ds-type"><span className="gt-label">H2 · 32 · Semibold</span><p className="gt-h2">Popular destinations</p></div>
              <div className="ds-type"><span className="gt-label">H3 · 24 · Semibold</span><p className="gt-h3">Lobé Falls</p></div>
              <div className="ds-type"><span className="gt-label">H4 · 20 · Medium</span><p className="gt-h4">Kribi, South Region</p></div>
              <div className="ds-type"><span className="gt-label">Body · 16</span><p>Discover incredible places, build your perfect itinerary, and travel Cameroon with confidence.</p></div>
              <div className="ds-type"><span className="gt-label">Small · 14</span><p className="gt-small gt-muted">2,000 FCFA per person · 3 hours</p></div>
              <div className="ds-type"><span className="gt-label">Caption · 12</span><p className="gt-caption gt-muted">Photo shows the surrounding city</p></div>
            </div>
          </section>

          {/* ------------------------------------------- spacing & radius */}
          <section className="ds-section">
            <SectionHead title="Spacing and radius" />
            <p className="gt-label">Spacing — 4 8 12 16 24 32 48</p>
            <div className="ds-scale">
              {SPACING.map(([n, px]) => (
                <div key={n} className="ds-scale__item">
                  <span className="ds-scale__bar" style={{ width: px, height: px }} />
                  <code>{px}</code>
                </div>
              ))}
            </div>
            <p className="gt-label" style={{ marginTop: 'var(--gt-space-5)' }}>Border radius</p>
            <div className="ds-scale">
              {RADII.map(([n, px]) => (
                <div key={n} className="ds-scale__item">
                  <span className="ds-scale__radius" style={{ borderRadius: px }} />
                  <code>{px}</code>
                </div>
              ))}
            </div>
            <p className="gt-label" style={{ marginTop: 'var(--gt-space-5)' }}>Elevation</p>
            <div className="ds-shadows">
              <div className="ds-shadow" style={{ boxShadow: 'var(--gt-shadow-sm)' }}>Small</div>
              <div className="ds-shadow" style={{ boxShadow: 'var(--gt-shadow-md)' }}>Medium</div>
              <div className="ds-shadow" style={{ boxShadow: 'var(--gt-shadow-lg)' }}>Large</div>
            </div>
          </section>

          {/* ----------------------------------------------------- buttons */}
          <section className="ds-section">
            <SectionHead title="Buttons" />
            <div className="ds-row">
              <Button>Primary button</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Remove</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="ds-row">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large <Sparkles size={16} /></Button>
              <Button loading>Building</Button>
              <Button icon aria-label="Save"><Heart size={17} /></Button>
            </div>
          </section>

          {/* ------------------------------------------- inputs and chips */}
          <section className="ds-section">
            <SectionHead title="Inputs and forms" />
            <div className="ds-forms">
              <SearchInput placeholder="Where do you want to go?" icon={<Search size={17} />} />
              <Field label="Region">
                <Select defaultValue=""><option value="">Select region</option><option>South</option><option>Littoral</option></Select>
              </Field>
              <Field label="Trip name" hint="Give it something you will recognise later.">
                <Input placeholder="Weekend in Kribi" />
              </Field>
              <Field label="Email address" error="Please enter a valid email address.">
                <Input defaultValue="not-an-email" />
              </Field>
              <Field label="Notes"><Textarea placeholder="Anything to remember about this stop?" /></Field>
            </div>

            <p className="gt-label" style={{ marginTop: 'var(--gt-space-5)' }}>Chips and tags</p>
            <div className="ds-row">
              {['all', 'hotels', 'restaurants', 'tourist sites'].map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c[0].toUpperCase() + c.slice(1)}
                </Chip>
              ))}
              <Chip>Kribi ✕</Chip>
              <Chip>50 – 100k FCFA ✕</Chip>
            </div>
            <div className="ds-row">
              <Badge tone="primary">Popular</Badge>
              <Badge tone="success">Open now</Badge>
              <Badge tone="warning">Guide recommended</Badge>
              <Badge tone="error">Closed</Badge>
              <Badge tone="neutral">Free</Badge>
            </div>
          </section>

          {/* ------------------------------------------------------- cards */}
          <section className="ds-section">
            <SectionHead title="Cards" subtitle="The image leads. A caption sits on the photograph, never beside it." />
            <Grid>
              <Card interactive>
                <CardMedia
                  src="/images/places/place-ekom-nkam-waterfalls.jpg"
                  alt="Ekom Nkam Waterfalls"
                  action={(
                    <Button
                      icon size="sm" className="gt-card__action"
                      aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save this place'}
                      onClick={() => setSaved((v) => !v)}
                    >
                      <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
                    </Button>
                  )}
                />
                <CardBody>
                  <CardTitle>Ekom Nkam Waterfalls</CardTitle>
                  <CardMeta><MapPin size={12} style={{ verticalAlign: '-2px' }} /> Melong, Littoral</CardMeta>
                  <div className="gt-row gt-gap-2"><Badge tone="primary">Waterfall</Badge><span className="gt-small gt-muted">2,000 FCFA</span></div>
                </CardBody>
              </Card>

              <Card interactive>
                <CardMedia
                  src="/images/destinations/kribi.jpg"
                  alt="Kribi"
                  contextual
                  overlay={<><CardTitle style={{ color: '#fff' }}>Baie Banoko</CardTitle><CardMeta style={{ color: 'rgba(255,255,255,.8)' }}>Kribi, South</CardMeta></>}
                />
              </Card>

              <Card padded>
                <CardTitle>A card with no photograph</CardTitle>
                <CardMeta>Not everything needs an image. Padding and hierarchy carry it.</CardMeta>
                <div className="gt-row gt-gap-2" style={{ marginTop: 'var(--gt-space-3)' }}>
                  <Button size="sm">Add to trip</Button>
                  <Button size="sm" variant="ghost">Details</Button>
                </div>
              </Card>
            </Grid>
          </section>

          {/* --------------------------------------------- feedback states */}
          <section className="ds-section">
            <SectionHead title="Empty, loading and feedback states" subtitle="A screen with nothing on it still has to say something useful." />
            <div className="ds-states">
              <EmptyState
                icon={<Compass size={22} />}
                title="No trips yet"
                body="Start exploring Cameroon and build your first adventure."
                action={<Button size="sm">Build my trip</Button>}
              />
              <div className="gt-stack gt-gap-4">
                <div className="gt-stack gt-gap-2">
                  <Skeleton height="1.2rem" width="60%" />
                  <Skeleton height="0.9rem" width="85%" />
                  <Skeleton height="0.9rem" width="40%" />
                </div>
                <ToastDemo />
                <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>Open a dialog</Button>
              </div>
            </div>

            <p className="gt-label" style={{ marginTop: 'var(--gt-space-5)' }}>Loading a collection</p>
            <SkeletonCards count={4} />
          </section>

          {/* -------------------------------------------------- navigation */}
          <section className="ds-section">
            <SectionHead title="Navigation" subtitle="A top bar on desktop, a tab bar on phones — two designs, not one squeezed." />
            <div className="ds-navdemo"><Brand withTagline /></div>
            <p className="gt-small gt-muted">
              The tab bar is fixed to the bottom of this page. Narrow the window
              below 900px and the top links give way to it.
            </p>
          </section>

          <footer className="ds-footer">
            <Brand />
            <p className="gt-small gt-muted">Cameroon Awaits 🇨🇲</p>
          </footer>
        </main>

        <TabBar isAuthenticated />

        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Save this place?"
          footer={(
            <div className="gt-row gt-gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => setDialogOpen(false)}><Bookmark size={16} /> Save</Button>
            </div>
          )}
        >
          <p className="gt-muted" style={{ margin: 0 }}>
            Add Lobé Falls to your saved places? You can add it to a trip later.
          </p>
        </Dialog>
      </div>
    </ToastProvider>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { Button } from './ui';
import * as api from '../lib/api';
import './assistant-dock.css';

/**
 * The assistant, on every screen.
 *
 * It answers from the application's own data — the catalogue, your trips, and
 * for an administrator the review queue and the account list — so it can say
 * "that is not in the catalogue" instead of inventing a waterfall.
 *
 * It also proposes what to do next, and the proposals depend on who is asking:
 * an administrator asking about pending suggestions is offered the review
 * queue, and a traveller asking the same question is not offered it and is not
 * told it exists. The server decides that, from the role on the account; this
 * component only renders what it is given.
 *
 * The bot never performs an action. Every proposal is a link the person
 * chooses to follow. A bot that acted on its own reading of a sentence would
 * eventually approve the wrong suggestion, and the click costs nothing.
 */

/**
 * Render one reply.
 *
 * The server sends plain text, because the original shell renders it as plain
 * text too. Dropping it into a single pre-wrap paragraph is what made answers
 * read badly: a costed estimate arrived as five run-on lines with bullet
 * characters sitting in the middle of a sentence.
 *
 * So the lines are read for what they are. A line that begins with a bullet or
 * a dash becomes a list item and the run of them becomes a real list;
 * everything else is a paragraph. Stray markdown emphasis is stripped rather
 * than displayed, since nothing here renders markdown and `**total**` on
 * screen is worse than no emphasis at all.
 */
function renderReply(text) {
  const clean = String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, '$1$2');  // *emphasis*

  const blocks = [];
  let list = null;

  clean.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;

    const bullet = /^[•\-\u2022]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) { list = []; blocks.push({ kind: 'list', items: list }); }
      list.push(bullet[1]);
    } else {
      list = null;
      blocks.push({ kind: 'text', text: line });
    }
  });

  if (blocks.length === 0) return null;

  return blocks.map((block, index) => (block.kind === 'list' ? (
    <ul className="dock__list" key={index}>
      {block.items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  ) : (
    <p className="dock__para" key={index}>{block.text}</p>
  )));
}

const GREETING = {
  from: 'bot',
  text:
    'Ask me about travelling in Cameroon, or about anything in this app. '
    + 'I answer from what is actually here, so I will tell you when something is not.',
};

/** Screens with nothing to ask about yet. */
const HIDDEN_ON = ['/login', '/register'];

export default function AssistantDock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [actions, setActions] = useState([]);
  const [starters, setStarters] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState('');

  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (starters.length === 0) {
      api.assistantStarters()
        .then((payload) => setStarters(payload?.starters || payload?.questions || []))
        .catch(() => { /* the box works without them */ });
    }
  }, [open, starters.length]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, open]);

  // Escape closes it, which is what people try first.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (question) => {
    const text = (question || draft).trim();
    if (!text || busy) return;

    setMessages((current) => [...current, { from: 'you', text }]);
    setDraft('');
    setBusy(true);

    try {
      const reply = await api.askAssistant(text);
      setMessages((current) => [...current, { from: 'bot', text: reply.reply }]);
      setActions(reply.actions || []);
    } catch (error) {
      setMessages((current) => [...current, {
        from: 'bot',
        text: error.message || 'I could not reach the server just then. Try again?',
        failed: true,
      }]);
      setActions([]);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Take an offered action.
   *
   * Most are somewhere to go. One does the thing: "Create a 3-day trip to
   * Limbe" creates it and opens it, because an action that only opened the
   * planning page and forgot the destination is an action that did nothing --
   * which is exactly how it behaved before.
   */
  const take = async (action) => {
    if (!action.run) { setOpen(false); navigate(action.path); return; }

    if (action.run.kind === 'create_trip') {
      setRunning(action.id);
      setMessages((current) => [...current, {
        from: 'bot',
        text: `Building a ${action.run.days}-day trip to ${action.run.location}…`,
      }]);
      try {
        const result = await api.quickPlan(
          { location: action.run.location, days: action.run.days },
          { token: api.getToken() },
        );
        const trip = result?.itinerary || result;
        if (!trip?.id) throw new Error('The trip came back without an id.');
        setMessages((current) => [...current, {
          from: 'bot',
          text: `Done — "${trip.title}" with ${(trip.stages || []).length} checkpoints. Opening it now.`,
        }]);
        setActions([]);
        setOpen(false);
        navigate(`/trips/${trip.id}`);
      } catch (error) {
        setMessages((current) => [...current, {
          from: 'bot',
          text: error.message || 'I could not build that trip. You can plan it yourself on the Trips page.',
          failed: true,
        }]);
      } finally {
        setRunning('');
      }
    }
  };

  if (HIDDEN_ON.includes(pathname)) return null;

  if (!open) {
    return (
      <button type="button" className="dock__open" onClick={() => setOpen(true)}>
        <MessageCircle size={18} aria-hidden="true" />
        <span>Ask</span>
      </button>
    );
  }

  return (
    <aside className="dock" role="dialog" aria-label="Travel assistant">
      <header className="dock__head">
        <span className="dock__title">
          <Sparkles size={16} aria-hidden="true" /> Assistant
        </span>
        <button
          type="button"
          className="dock__close"
          onClick={() => setOpen(false)}
          aria-label="Close the assistant"
        >
          <X size={16} />
        </button>
      </header>

      <div className="dock__log">
        {messages.map((message, index) => (
          <p
            key={index}
            className={[
              'dock__msg',
              message.from === 'you' ? 'dock__msg--you' : 'dock__msg--bot',
              message.failed ? 'dock__msg--failed' : '',
            ].filter(Boolean).join(' ')}
          >
            {message.from === 'bot' ? renderReply(message.text) : message.text}
          </p>
        ))}

        {busy && <p className="dock__msg dock__msg--bot dock__typing">Thinking…</p>}

        {/* What this role could do next. Rendered after the latest answer,
            because that is what they are about. */}
        {!busy && actions.length > 0 && (
          <div className="dock__actions">
            <p className="dock__actions-label">You can</p>
            {actions.map((action) => (
              <button
                key={action.id || action.path}
                type="button"
                className={`dock__action${action.run ? ' dock__action--do' : ''}`}
                onClick={() => take(action)}
                disabled={Boolean(running)}
              >
                {running === action.id ? 'Working…' : action.label}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {messages.length === 1 && starters.length > 0 && (
          <div className="dock__starters">
            {starters.slice(0, 4).map((starter) => (
              <button
                key={starter}
                type="button"
                className="dock__starter"
                onClick={() => ask(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
        )}

        <span ref={endRef} />
      </div>

      <form
        className="dock__ask"
        onSubmit={(event) => { event.preventDefault(); ask(); }}
      >
        <input
          ref={inputRef}
          className="dock__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask anything…"
          aria-label="Ask the assistant"
          maxLength={500}
        />
        <Button type="submit" size="sm" disabled={busy || !draft.trim()} aria-label="Send">
          <Send size={15} aria-hidden="true" />
        </Button>
      </form>
    </aside>
  );
}

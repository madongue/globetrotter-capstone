import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button, Spinner, Textarea } from './ui';
import { Avatar } from '../pages/Community';
import { timeAgo } from '../lib/useCommunity';
import * as api from '../lib/api';
import './group-chat.css';

/**
 * Live chat inside a community group.
 *
 * Delivery is a poll with a cursor, not a socket — see the note in app/chat.py
 * for why: the application runs under two gunicorn workers, and a WebSocket
 * broadcast would only reach travellers connected to the same one.
 *
 * The poll is deliberately quiet about itself. It asks every two seconds for
 * whatever is newer than the last message it holds, so an idle room costs one
 * small request and renders nothing. A sent message appears immediately from
 * the POST's own response rather than waiting for the next tick, which is what
 * makes it feel like a conversation instead of a form.
 */

const POLL_MS = 2000;

export default function GroupChat({ roomId, token, username, canPost }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const cursor = useRef('');
  const listRef = useRef(null);
  const atBottom = useRef(true);

  /** Merge new messages in, ignoring any the optimistic send already added. */
  const absorb = useCallback((incoming) => {
    if (!incoming?.length) return;
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...current, ...fresh] : current;
    });
  }, []);

  useEffect(() => {
    if (!roomId || !token) return undefined;

    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const payload = await api.readChat(roomId, { since: cursor.current, token });
        if (cancelled) return;
        cursor.current = payload.cursor || cursor.current;
        absorb(payload.messages);
        setError(null);
      } catch (err) {
        // A failed poll is not worth an error message — the next one usually
        // succeeds. Only a first load that fails is worth reporting.
        if (!cancelled && loading) setError(err.message || 'Could not load the chat.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(tick, POLL_MS);
        }
      }
    };

    setMessages([]);
    setLoading(true);
    cursor.current = '';
    tick();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token]);

  /* Follow the conversation, but only if the reader was already at the bottom:
     scrolling someone back down while they are reading history is rude. */
  useEffect(() => {
    const node = listRef.current;
    if (node && atBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const node = listRef.current;
    if (!node) return;
    atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
  };

  const send = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const payload = await api.sendChat(roomId, text, { token });
      const sent = payload?.chat_message;
      if (sent) {
        // Shown straight away rather than on the next poll.
        absorb([sent]);
        cursor.current = sent.sent_at;
      }
      setDraft('');
      atBottom.current = true;
    } catch (err) {
      setError(err.message || 'Could not send that message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="chat" aria-label="Group chat">
      <div className="chat__log" ref={listRef} onScroll={onScroll} aria-live="polite">
        {loading ? (
          <div className="chat__state"><Spinner label="Loading the chat" /></div>
        ) : messages.length === 0 ? (
          <p className="chat__state gt-small gt-muted">
            No messages yet. Say hello — everyone in this group will see it.
          </p>
        ) : messages.map((message) => {
          const mine = message.username === username;
          return (
            <div key={message.id} className={`chat__row${mine ? ' is-mine' : ''}`}>
              {!mine && <Avatar username={message.username} src={message.avatar_url} size={30} />}
              <div className="chat__bubble">
                {!mine && <span className="chat__who">{message.username}</span>}
                <p>{message.text}</p>
                <time className="chat__time" dateTime={message.sent_at}>
                  {timeAgo(message.sent_at)}
                </time>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="chat__error" role="alert">{error}</p>}

      {canPost ? (
        <form className="chat__compose" onSubmit={send}>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter starts a new line — what a chat does.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); }
            }}
            placeholder="Message the group…"
            aria-label="Your message"
            rows={1}
          />
          <Button type="submit" icon loading={sending} disabled={!draft.trim()} aria-label="Send">
            <Send size={16} />
          </Button>
        </form>
      ) : (
        <p className="chat__locked gt-small gt-muted">Join this group to join the conversation.</p>
      )}
    </section>
  );
}

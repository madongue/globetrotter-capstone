import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Phone, PhoneOff, Video, VideoOff,
} from 'lucide-react';
import { Button, useToast } from './ui';
import * as api from '../lib/api';
import './call-panel.css';

/**
 * Audio and video calls between two members of a group.
 *
 * The media is peer-to-peer: once the two browsers have found each other they
 * send audio and video directly, and none of it passes through the server.
 * What the server carries is the introduction — an SDP offer, an answer, and
 * the ICE candidates — polled on the same cursor the chat uses.
 *
 * Three things here are easy to get wrong and are handled deliberately:
 *
 *   ICE candidates arrive before the description they belong to. The remote
 *   description has to be set before a candidate can be added, and polling
 *   makes no promise about order, so early candidates are queued and flushed.
 *
 *   getUserMedia must be released. A camera left open keeps the browser's
 *   recording indicator lit after the call, which people reasonably read as
 *   being spied on. Every exit path stops every track.
 *
 *   A call can fail to connect at all. Without a TURN relay two peers behind
 *   uncooperative NATs have no route to each other, and the honest thing is to
 *   say so rather than spin forever — so `iceconnectionstate` failing ends the
 *   call with a message that explains it.
 */

/* Public STUN only. A TURN relay is what would make calls work on networks
   that refuse direct connections, and it is a paid service — see the note in
   app/calls.py. These let a browser discover its own public address. */
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/* Faster than the chat's two seconds: during setup these few seconds are the
   whole of the wait before a call connects. */
const SIGNAL_POLL_MS = 900;
const RING_POLL_MS = 3000;

/**
 * Attach a stream to a media element and start it.
 *
 * Setting `srcObject` is not enough on its own: the element stays paused, so
 * there is no picture and — worse, because it is silent in both senses — no
 * sound. `autoplay` does not cover it either, since a remote stream carries
 * audio and autoplay with audio is blocked until the page has had a user
 * gesture. Answering a call is such a gesture, so play() resolves in practice;
 * it is still called explicitly, and its rejection handled, rather than
 * assumed.
 */
async function attachAndPlay(element, stream) {
  if (!element || !stream) return;
  if (element.srcObject !== stream) element.srcObject = stream;
  try {
    await element.play();
  } catch {
    // Autoplay refused. The stream is attached, so a later gesture on the
    // page will start it; the controls below are all gestures.
  }
}

export default function CallPanel({ roomId, token, username, canCall }) {
  const toast = useToast();

  const [call, setCall] = useState(null);          // the server's view
  const [phase, setPhase] = useState('idle');      // idle|ringing|incoming|connecting|live|ending
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteLive, setRemoteLive] = useState(false);

  const pc = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const cursor = useRef('');
  const pendingIce = useRef([]);
  const remoteSet = useRef(false);
  const callRef = useRef(null);
  const closing = useRef(false);

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ------------------------------------------------------------- teardown */

  const teardown = useCallback(() => {
    // Tracks first: an open camera is the one piece of this that keeps
    // affecting someone after they have stopped looking at the page.
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    if (pc.current) {
      try { pc.current.close(); } catch { /* already closed */ }
      pc.current = null;
    }
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    remoteStream.current = null;
    cursor.current = '';
    pendingIce.current = [];
    remoteSet.current = false;
    callRef.current = null;
    setRemoteLive(false);
    setMicOn(true);
    setCamOn(true);
  }, []);

  const hangUp = useCallback(async (reason) => {
    const current = callRef.current;
    closing.current = true;
    teardown();
    setPhase('idle');
    setCall(null);
    if (current?.id) {
      try { await api.endCall(current.id, reason, { token }); } catch { /* already gone */ }
    }
    closing.current = false;
  }, [teardown, token]);

  // Leaving the page must not leave the camera on or the call ringing.
  useEffect(() => () => {
    const current = callRef.current;
    teardown();
    if (current?.id) {
      try { api.endCall(current.id, 'left', { token }); } catch { /* best effort */ }
    }
  }, [teardown, token]);

  /* --------------------------------------------------------- media + peer */

  const getMedia = useCallback(async (mode) => {
    const wanted = { audio: true, video: mode === 'video' };
    const stream = await navigator.mediaDevices.getUserMedia(wanted);
    localStream.current = stream;
    // Muted, so this one is never blocked — but started explicitly all the
    // same, so both previews behave identically.
    attachAndPlay(localVideo.current, stream);
    return stream;
  }, []);

  const buildPeer = useCallback((callId, stream) => {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      api.sendCallSignal(callId, { kind: 'ice', payload: event.candidate.toJSON() }, { token })
        .catch(() => { /* the other side will still have other candidates */ });
    };

    peer.ontrack = (event) => {
      // `event.streams` is normally one stream carrying both tracks, but it
      // can be empty; collecting the tracks covers both shapes.
      let stream = event.streams && event.streams[0];
      if (!stream) {
        remoteStream.current = remoteStream.current || new MediaStream();
        remoteStream.current.addTrack(event.track);
        stream = remoteStream.current;
      } else {
        remoteStream.current = stream;
      }
      attachAndPlay(remoteVideo.current, stream);
      setRemoteLive(true);
      setPhase('live');
    };

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState;
      if (state === 'failed') {
        // No route between the two browsers. Saying so beats spinning.
        toast.push(
          'Could not connect the call. One of you is on a network that blocks '
          + 'direct connections.',
          'error',
        );
        hangUp('ice_failed');
      } else if (state === 'disconnected' || state === 'closed') {
        if (!closing.current) hangUp('dropped');
      }
    };

    pc.current = peer;
    // A handle for end-to-end tests, which need to read getStats() to prove
    // media is actually flowing — a headless browser does not render video, so
    // the element's own state says nothing useful.
    if (typeof window !== 'undefined') window.__gtCall = peer;
    return peer;
  }, [token, toast, hangUp]);

  /** Candidates can arrive before the description they belong to. */
  const addIce = useCallback(async (candidate) => {
    if (!pc.current) return;
    if (!remoteSet.current) { pendingIce.current.push(candidate); return; }
    try { await pc.current.addIceCandidate(candidate); } catch { /* stale candidate */ }
  }, []);

  const flushIce = useCallback(async () => {
    remoteSet.current = true;
    const queued = pendingIce.current;
    pendingIce.current = [];
    for (const candidate of queued) {
      try { await pc.current?.addIceCandidate(candidate); } catch { /* stale */ }
    }
  }, []);

  /* -------------------------------------------------------------- calling */

  const startCall = async (mode) => {
    if (!canCall) return;
    setPhase('connecting');
    try {
      const stream = await getMedia(mode);
      const { call: created } = await api.startCall({ roomId, mode }, { token });
      callRef.current = created;
      setCall(created);

      // Someone else was already ringing: answer theirs instead of starting a
      // second call nobody would be on the other end of.
      if (created.caller !== username) {
        stream.getTracks().forEach((t) => t.stop());
        localStream.current = null;
        setPhase('incoming');
        return;
      }

      const peer = buildPeer(created.id, stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await api.sendCallSignal(created.id, { kind: 'offer', payload: offer }, { token });
      setPhase('ringing');
    } catch (error) {
      teardown();
      setPhase('idle');
      toast.push(
        error.name === 'NotAllowedError'
          ? 'Your browser blocked access to the microphone or camera.'
          : error.message || 'Could not start the call.',
        'error',
      );
    }
  };

  const accept = async () => {
    const incoming = callRef.current;
    if (!incoming) return;
    setPhase('connecting');
    try {
      await api.answerCall(incoming.id, { token });
      const stream = await getMedia(incoming.mode);
      buildPeer(incoming.id, stream);
      // The offer itself arrives on the next poll, which then answers it.
    } catch (error) {
      teardown();
      setPhase('idle');
      toast.push(
        error.status === 409
          ? 'Someone else answered first.'
          : error.message || 'Could not join the call.',
        'error',
      );
    }
  };

  const decline = () => hangUp('declined');

  /* ------------------------------------------------------- ringing poller */

  useEffect(() => {
    if (!roomId || !token || !canCall) return undefined;
    let stop = false;
    let timer;

    const tick = async () => {
      if (stop) return;
      // Only while idle: during a call the signal poller below is in charge.
      if (phaseRef.current === 'idle') {
        try {
          const { call: live } = await api.getActiveCall(roomId, { token });
          if (!stop && live && live.caller !== username && live.status === 'ringing') {
            callRef.current = live;
            setCall(live);
            setPhase('incoming');
          }
        } catch { /* keep polling */ }
      }
      if (!stop) timer = setTimeout(tick, RING_POLL_MS);
    };

    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [roomId, token, username, canCall]);

  /* -------------------------------------------------------- signal poller */

  useEffect(() => {
    const active = call?.id;
    if (!active || !token) return undefined;
    if (!['ringing', 'connecting', 'live'].includes(phase)) return undefined;

    let stop = false;
    let timer;

    const tick = async () => {
      if (stop) return;
      try {
        const payload = await api.readCallSignals(active, { since: cursor.current, token });

        // The other side hung up, or nobody ever answered.
        if (payload.call?.status === 'ended') {
          toast.push('Call ended.');
          await hangUp('remote_ended');
          return;
        }

        /* The cursor advances only after a batch has actually been applied,
           and only once the peer connection exists.

           The callee builds its peer after getUserMedia resolves, and the
           caller's offer can easily arrive in the window before that. Reading
           the batch and moving the cursor anyway would consume the offer in a
           poll that could not use it — and since a cursor never goes
           backwards, that offer would never be delivered again. The callee
           then sits in "stable" for ever while the caller waits in
           "have-local-offer", which is exactly what happened: it passed on
           timing once and then stopped working. */
        if (!pc.current) {
          if (!stop) timer = setTimeout(tick, SIGNAL_POLL_MS);
          return;
        }

        for (const signal of payload.signals || []) {
          if (stop || !pc.current) break;

          if (signal.kind === 'offer') {
            await pc.current.setRemoteDescription(signal.payload);
            await flushIce();
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            await api.sendCallSignal(active, { kind: 'answer', payload: answer }, { token });
          } else if (signal.kind === 'answer') {
            if (!pc.current.currentRemoteDescription) {
              await pc.current.setRemoteDescription(signal.payload);
              await flushIce();
            }
          } else if (signal.kind === 'ice') {
            await addIce(signal.payload);
          }
        }

        // Reached only when the whole batch applied without throwing.
        cursor.current = payload.cursor || cursor.current;
      } catch { /* one failed poll is not a dropped call; the cursor stays put */ }
      if (!stop) timer = setTimeout(tick, SIGNAL_POLL_MS);
    };

    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [call?.id, phase, token, addIce, flushIce, hangUp, toast]);

  /* -------------------------------------------------------------- controls */

  const toggleMic = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  };

  const toggleCam = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  };

  /* ----------------------------------------------------------------- view */

  if (!canCall) return null;

  if (phase === 'idle') {
    return (
      <div className="call call--idle">
        <span className="call__hint">Call the group</span>
        <div className="call__start">
          <Button size="sm" variant="secondary" onClick={() => startCall('audio')}>
            <Phone size={15} aria-hidden="true" /> Audio
          </Button>
          <Button size="sm" variant="secondary" onClick={() => startCall('video')}>
            <Video size={15} aria-hidden="true" /> Video
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'incoming') {
    return (
      <div className="call call--incoming" role="alert">
        <span className="call__who">
          <strong>{call?.caller}</strong> is calling
          <span className="gt-caption gt-muted"> · {call?.mode === 'audio' ? 'audio' : 'video'}</span>
        </span>
        <div className="call__start">
          <Button size="sm" onClick={accept}><Phone size={15} aria-hidden="true" /> Answer</Button>
          <Button size="sm" variant="danger" onClick={decline}>
            <PhoneOff size={15} aria-hidden="true" /> Decline
          </Button>
        </div>
      </div>
    );
  }

  const video = call?.mode === 'video';

  return (
    <div className={`call call--live${video ? '' : ' call--audio'}`}>
      <div className="call__stage">
        {/* Always rendered, even for an audio call: the element is what the
            remote stream is attached to, and it carries the audio. */}
        <video
          ref={remoteVideo}
          className="call__remote"
          autoPlay
          playsInline
          aria-label="The other caller"
        />
        {!remoteLive && (
          <p className="call__status">
            {phase === 'ringing' ? 'Ringing…' : 'Connecting…'}
          </p>
        )}
        {video && (
          <video
            ref={localVideo}
            className="call__local"
            autoPlay
            playsInline
            muted
            aria-label="You"
          />
        )}
      </div>

      <div className="call__controls">
        <button
          type="button"
          className={`call__btn${micOn ? '' : ' call__btn--off'}`}
          onClick={toggleMic}
          aria-pressed={!micOn}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        {video && (
          <button
            type="button"
            className={`call__btn${camOn ? '' : ' call__btn--off'}`}
            onClick={toggleCam}
            aria-pressed={!camOn}
            aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          >
            {camOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
        )}

        <button
          type="button"
          className="call__btn call__btn--end"
          onClick={() => hangUp('hung_up')}
          aria-label="Hang up"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}

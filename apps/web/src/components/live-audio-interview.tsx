'use client';

import { useEffect, useRef, useState } from 'react';
import type { Room, RemoteTrack, RemoteTrackPublication } from 'livekit-client';
import { AudioSessionSchema } from '@swipe/contracts';
import { LiveApiError, liveApi } from '../lib/live-api';

type AudioState = 'ready' | 'connecting' | 'connected' | 'reconnecting' | 'left' | 'failed';
const microphoneError = (failure: unknown) => {
  const name = failure instanceof Error ? failure.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return 'Microphone access was blocked. Allow microphone access in your browser settings, then try unmuting again.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'No microphone was found. Connect a microphone, then try again.';
  if (name === 'NotReadableError')
    return 'Your microphone is unavailable or being used by another application. Check the device and try again.';
  return 'Your microphone could not be enabled. Check your browser permissions and audio device, then try again.';
};

async function disposeRoom(room: Room | null) {
  if (!room) return;
  room.removeAllListeners();
  room.localParticipant.trackPublications.forEach((publication) => publication.track?.stop());
  room.remoteParticipants.forEach((participant) =>
    participant.audioTrackPublications.forEach((publication) =>
      publication.track?.detach().forEach((element) => element.remove()),
    ),
  );
  await room.disconnect(true).catch(() => undefined);
}

export function LiveAudioInterview({
  interviewId,
  candidateHandle,
  closesAt,
  onClose,
  onAuthFailure,
}: {
  interviewId: string;
  candidateHandle: string;
  closesAt: string;
  onClose: () => void;
  onAuthFailure: (failure: unknown) => void;
}) {
  const [status, setStatus] = useState<AudioState>('ready');
  const [error, setError] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [participantName, setParticipantName] = useState('');
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
      const room = roomRef.current;
      roomRef.current = null;
      void disposeRoom(room);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() < Date.parse(closesAt)) return;
      generation.current++;
      controller.current?.abort();
      const room = roomRef.current;
      roomRef.current = null;
      void disposeRoom(room);
      if (mounted.current) {
        setStatus('left');
        setMicEnabled(false);
        setPeerCount(0);
        setError('The interview access window has ended.');
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [closesAt]);

  useEffect(() => {
    if (status !== 'connected' && status !== 'reconnecting') return;
    let cancelled = false;
    let checking = false;
    let pending: AbortController | null = null;
    const timer = setInterval(async () => {
      const room = roomRef.current;
      const run = generation.current;
      if (!room || checking) return;
      checking = true;
      pending = new AbortController();
      const timeout = setTimeout(() => pending?.abort(), 15_000);
      try {
        await liveApi(`/interviews/${interviewId}/audio-session`, {
          method: 'POST',
          body: {},
          signal: pending.signal,
          parse: (value) => {
            if (!value || typeof value !== 'object' || !('session' in value))
              throw new Error('Missing audio session');
            const grant = AudioSessionSchema.parse(value.session);
            if (grant.interviewId !== interviewId || Date.parse(grant.expiresAt) <= Date.now())
              throw new Error('Expired permission check');
            return null; // Discard the refreshed join token; the connected room uses its existing transport.
          },
        });
      } catch (failure) {
        if (cancelled || !mounted.current || generation.current !== run || roomRef.current !== room)
          return;
        generation.current++;
        roomRef.current = null;
        await disposeRoom(room);
        audioRef.current?.replaceChildren();
        setStatus('left');
        setMicEnabled(false);
        setPeerCount(0);
        setError(
          'We could no longer verify your access, so the audio connection was closed. Refresh the interview and try again.',
        );
        if (failure instanceof LiveApiError && failure.status === 401) onAuthFailure(failure);
      } finally {
        clearTimeout(timeout);
        checking = false;
      }
    }, 30_000);
    return () => {
      cancelled = true;
      pending?.abort();
      clearInterval(timer);
    };
  }, [status, interviewId]);

  async function join() {
    if (roomRef.current || status === 'connecting' || Date.now() >= Date.parse(closesAt)) return;
    const run = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setStatus('connecting');
    setMicBusy(false);
    setError('');
    setMicEnabled(false);
    setPeerCount(0);
    setNeedsAudioStart(false);
    const active = () => mounted.current && generation.current === run;
    try {
      if (!('RTCPeerConnection' in window)) throw new Error('Unsupported browser');
      const session = await liveApi(`/interviews/${interviewId}/audio-session`, {
        method: 'POST',
        body: {},
        signal: abort.signal,
        parse: (value) => {
          if (!value || typeof value !== 'object' || !('session' in value))
            throw new Error('Missing audio session');
          return AudioSessionSchema.parse(value.session);
        },
      });
      if (!active()) return;
      if (session.interviewId !== interviewId || Date.parse(session.expiresAt) <= Date.now())
        throw new Error('Expired audio session');
      const sdk = await import('livekit-client');
      if (!active()) return;
      // Avoid identifiers/tokens in SDK logs; user-facing failures below are deliberately generic.
      sdk.setLogLevel(sdk.LogLevel.silent);
      const room = new sdk.Room({
        adaptiveStream: false,
        dynacast: false,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
      });
      roomRef.current = room;
      const current = () => active() && roomRef.current === room;
      const peers = () => {
        if (current()) setPeerCount(room.remoteParticipants.size);
      };
      const subscribeMicrophone = (publication: RemoteTrackPublication) => {
        if (
          publication.kind === sdk.Track.Kind.Audio &&
          publication.source === sdk.Track.Source.Microphone
        )
          publication.setSubscribed(true);
      };
      const attachAudio = (track: RemoteTrack, publication: RemoteTrackPublication) => {
        if (
          !current() ||
          track.kind !== sdk.Track.Kind.Audio ||
          publication.source !== sdk.Track.Source.Microphone
        )
          return;
        const element = track.attach();
        element.autoplay = true;
        element.setAttribute('data-interview-audio', 'remote');
        audioRef.current?.append(element);
        void element.play().catch(() => {
          if (current()) setNeedsAudioStart(true);
        });
      };
      room.on(sdk.RoomEvent.TrackPublished, subscribeMicrophone);
      room.on(sdk.RoomEvent.TrackSubscribed, attachAudio);
      room.on(sdk.RoomEvent.TrackUnsubscribed, (track) =>
        track.detach().forEach((element) => element.remove()),
      );
      room.on(sdk.RoomEvent.ParticipantConnected, peers);
      room.on(sdk.RoomEvent.ParticipantDisconnected, peers);
      room.on(sdk.RoomEvent.AudioPlaybackStatusChanged, (playing) => {
        if (current()) setNeedsAudioStart(!playing);
      });
      room.on(sdk.RoomEvent.TrackSubscriptionFailed, () => {
        if (current())
          setError(
            'The other participant’s audio could not be received. Check your connection or leave and rejoin.',
          );
      });
      room.on(sdk.RoomEvent.ConnectionStateChanged, (state) => {
        if (!current()) return;
        if (state === sdk.ConnectionState.Connected) setStatus('connected');
        else if (
          state === sdk.ConnectionState.Reconnecting ||
          state === sdk.ConnectionState.SignalReconnecting
        )
          setStatus('reconnecting');
      });
      room.on(sdk.RoomEvent.Disconnected, () => {
        if (!current()) return;
        roomRef.current = null;
        void disposeRoom(room);
        audioRef.current?.replaceChildren();
        setStatus('left');
        setMicEnabled(false);
        setPeerCount(0);
        setError(
          'The audio connection ended. You can try rejoining while this interview is available.',
        );
      });
      await room.connect(session.serverUrl, session.token, { autoSubscribe: false });
      if (!current()) {
        await disposeRoom(room);
        return;
      }
      setParticipantName(session.participantName);
      room.remoteParticipants.forEach((participant) =>
        participant.trackPublications.forEach(subscribeMicrophone),
      );
      peers();
      setStatus('connected');
      // Joining never creates a local media track. Only the explicit unmute action asks for a microphone.
      try {
        await room.startAudio();
      } catch {
        if (current()) setNeedsAudioStart(true);
      }
      if (current()) setNeedsAudioStart(!room.canPlaybackAudio);
    } catch (failure) {
      if (!active()) return;
      const room = roomRef.current;
      roomRef.current = null;
      await disposeRoom(room);
      audioRef.current?.replaceChildren();
      setStatus('failed');
      setError(
        failure instanceof LiveApiError
          ? failure.message
          : 'The audio room could not be reached. Check your network and browser support, then try again.',
      );
      if (failure instanceof LiveApiError && failure.status === 401) onAuthFailure(failure);
    }
  }
  async function toggleMicrophone() {
    const room = roomRef.current;
    const run = generation.current;
    if (!room || status !== 'connected' || micBusy) return;
    setMicBusy(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone unavailable');
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled, {
        echoCancellation: true,
        noiseSuppression: true,
      });
      if (mounted.current && generation.current === run && roomRef.current === room)
        setMicEnabled(room.localParticipant.isMicrophoneEnabled);
      else await disposeRoom(room);
    } catch (failure) {
      if (mounted.current && generation.current === run) setError(microphoneError(failure));
      else await disposeRoom(room);
    } finally {
      if (mounted.current && generation.current === run) setMicBusy(false);
    }
  }
  async function enableAudio() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      if (mounted.current && roomRef.current === room) setNeedsAudioStart(!room.canPlaybackAudio);
    } catch {
      if (mounted.current)
        setError('Speaker audio is blocked. Allow audio playback in your browser and try again.');
    }
  }
  async function leave() {
    generation.current++;
    controller.current?.abort();
    const room = roomRef.current;
    roomRef.current = null;
    setStatus('left');
    setMicEnabled(false);
    setMicBusy(false);
    setPeerCount(0);
    setNeedsAudioStart(false);
    setError('');
    audioRef.current?.replaceChildren();
    await disposeRoom(room);
  }
  const inRoom = status === 'connected' || status === 'reconnecting';
  return (
    <section className="live-audio-panel" aria-label="Blind audio interview">
      <div className="live-audio-heading">
        <div>
          <span className="eyebrow">BLIND FIRST INTERVIEW</span>
          <h3>{candidateHandle}</h3>
        </div>
        <span className="tag">Microphone only · no recording</span>
      </div>
      <div className={`live-audio-orb ${micEnabled ? 'speaking' : ''}`} aria-hidden="true">
        {inRoom ? '◉' : '◌'}
      </div>
      <div className="live-audio-status" role="status" aria-live="polite">
        <strong>
          {status === 'connected'
            ? 'Connected to the audio room'
            : status === 'connecting'
              ? 'Connecting to the audio room…'
              : status === 'reconnecting'
                ? 'Reconnecting — audio may pause'
                : status === 'left'
                  ? 'You’re out of the audio room'
                  : status === 'failed'
                    ? 'Not connected'
                    : 'Ready for a first conversation?'}
        </strong>
        <p>
          {inRoom
            ? `${peerCount} other participant${peerCount === 1 ? '' : 's'} connected · Your microphone is ${micEnabled ? 'on' : 'off'}`
            : 'Join with your microphone off. Unmute when you’re ready to speak.'}
        </p>
        {inRoom && participantName && <small>You appear as {participantName}.</small>}
      </div>
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      {needsAudioStart && inRoom && (
        <button className="button secondary live-enable-audio" onClick={enableAudio}>
          Enable speaker audio
        </button>
      )}
      <div className="live-audio-controls">
        {inRoom ? (
          <>
            <button
              className="button primary"
              aria-pressed={micEnabled}
              disabled={micBusy || status !== 'connected'}
              onClick={toggleMicrophone}
            >
              {micBusy
                ? 'Checking microphone…'
                : micEnabled
                  ? 'Mute microphone'
                  : 'Unmute microphone'}
            </button>
            <button className="button secondary live-leave-call" onClick={leave}>
              Leave audio call
            </button>
          </>
        ) : status === 'connecting' ? (
          <button className="button secondary" onClick={leave}>
            Cancel connection
          </button>
        ) : (
          <>
            <button
              className="button primary"
              disabled={Date.now() >= Date.parse(closesAt)}
              onClick={join}
            >
              {status === 'ready' ? 'Join audio room' : 'Rejoin audio room'}
            </button>
            <button className="button secondary" onClick={onClose}>
              Close audio panel
            </button>
          </>
        )}
      </div>
      <p className="live-small-note">
        Keep names and contact details private. Your browser asks for microphone access only when
        you unmute. Leaving this job tab disconnects your call. Connection status does not confirm
        interview completion or unlock identity.
      </p>
      <div ref={audioRef} className="live-remote-audio" aria-hidden="true" />
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { AudioSession } from '@swipe/contracts';
import type { Room, RemoteTrack } from 'livekit-client';
export type PrepareAudio = () => Promise<() => Promise<void>>;
export function useAudioRoom(
  session: AudioSession,
  prepare: PrepareAudio,
  onTrack?: (track: RemoteTrack) => void,
) {
  const roomRef = useRef<Room | null>(null);
  const active = useRef(false);
  const [connection, setConnection] = useState('connecting');
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState(1);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  useEffect(() => {
    let disposed = false;
    let platformCleanup: (() => Promise<void>) | null = null;
    let room: Room | null = null;
    active.current = true;
    const stopTracks = () => {
      room?.localParticipant.trackPublications.forEach((publication) => publication.track?.stop());
    };
    const cleanup = () => {
      stopTracks();
      void room?.disconnect(true).catch(() => undefined);
      if (platformCleanup) {
        void platformCleanup().catch(() => undefined);
        platformCleanup = null;
      }
    };
    void (async () => {
      try {
        platformCleanup = await prepare();
        if (disposed) {
          cleanup();
          return;
        }
        const sdk = await import('livekit-client');
        if (disposed) {
          cleanup();
          return;
        }
        sdk.setLogLevel(sdk.LogLevel.silent);
        room = new sdk.Room({ adaptiveStream: false, dynacast: false });
        roomRef.current = room;
        const count = () => {
          if (!disposed) setParticipants((room?.remoteParticipants.size ?? 0) + 1);
        };
        room.on(sdk.RoomEvent.ConnectionStateChanged, (state) => {
          if (!disposed) {
            setConnection(state);
            if (state === 'disconnected') {
              setMuted(true);
              stopTracks();
            }
          }
        });
        room.on(sdk.RoomEvent.ParticipantConnected, count);
        room.on(sdk.RoomEvent.ParticipantDisconnected, count);
        room.on(sdk.RoomEvent.TrackSubscribed, (track) => {
          if (
            !disposed &&
            track.kind === sdk.Track.Kind.Audio &&
            track.source === sdk.Track.Source.Microphone
          )
            onTrack?.(track);
        });
        room.on(sdk.RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!disposed) setPlaybackBlocked(!room!.canPlaybackAudio);
        });
        room.on(sdk.RoomEvent.TrackMuted, () => {
          if (!disposed) setMuted(!room!.localParticipant.isMicrophoneEnabled);
        });
        room.on(sdk.RoomEvent.TrackUnmuted, () => {
          if (!disposed) setMuted(!room!.localParticipant.isMicrophoneEnabled);
        });
        await room.connect(session.serverUrl, session.token, { autoSubscribe: true });
        if (disposed) {
          cleanup();
          return;
        }
        count();
        setConnection(room.state);
        setMuted(true);
        // Deliberately do not create/publish a microphone track on connect.
      } catch {
        if (!disposed) {
          setError('Could not connect to audio. Leave and try again.');
          setConnection('disconnected');
        }
        cleanup();
      }
    })();
    return () => {
      disposed = true;
      active.current = false;
      roomRef.current = null;
      cleanup();
    };
  }, [session.serverUrl, session.token, prepare, onTrack]);
  async function toggleMicrophone() {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy(true);
    setError('');
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled, {
        echoCancellation: true,
        noiseSuppression: true,
      });
      if (active.current) setMuted(!room.localParticipant.isMicrophoneEnabled);
      else
        room.localParticipant.trackPublications.forEach((publication) => publication.track?.stop());
    } catch {
      if (active.current)
        setError(
          'Microphone unavailable. Allow microphone access in your device/browser settings, then try again.',
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function enablePlayback() {
    try {
      await roomRef.current?.startAudio();
      if (active.current) setPlaybackBlocked(false);
    } catch {
      if (active.current)
        setError('Audio playback is blocked. Check browser audio permissions and try again.');
    }
  }
  return {
    connection,
    muted,
    busy,
    error,
    participants,
    playbackBlocked,
    toggleMicrophone,
    enablePlayback,
  };
}

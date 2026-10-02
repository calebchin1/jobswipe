import { useCallback, useEffect, useRef } from 'react';
import type { AudioSession } from '@swipe/contracts';
import type { RemoteTrack } from 'livekit-client';
import { useAudioRoom } from './useAudioRoom';
import AudioControls from './AudioControls';
const prepare = async () => async () => {};
export default function AudioRoom({
  session,
  onLeave,
}: {
  session: AudioSession;
  onLeave: () => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const tracks = useRef<RemoteTrack[]>([]);
  const onTrack = useCallback((track: RemoteTrack) => {
    tracks.current.push(track);
    const element = track.attach();
    element.autoplay = true;
    container.current?.appendChild(element);
  }, []);
  const state = useAudioRoom(session, prepare, onTrack);
  useEffect(() => {
    const leave = () => onLeave();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      tracks.current.forEach((track) => track.detach().forEach((element) => element.remove()));
      tracks.current = [];
    };
  }, [onLeave]);
  return (
    <>
      <div ref={container} aria-hidden="true" style={{ display: 'none' }} />
      <AudioControls state={state} onLeave={onLeave} />
    </>
  );
}

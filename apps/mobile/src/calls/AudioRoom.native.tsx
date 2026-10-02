import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { AudioSession } from '@swipe/contracts';
import { useAudioRoom } from './useAudioRoom';
import AudioControls from './AudioControls';
let registered = false;
async function prepare() {
  const native = await import('@livekit/react-native');
  if (!registered) {
    native.registerGlobals();
    registered = true;
  }
  try {
    await native.AudioSession.startAudioSession();
  } catch (error) {
    await native.AudioSession.stopAudioSession().catch(() => undefined);
    throw error;
  }
  return async () => {
    await native.AudioSession.stopAudioSession();
  };
}
export default function AudioRoom({
  session,
  onLeave,
}: {
  session: AudioSession;
  onLeave: () => void;
}) {
  const state = useAudioRoom(session, prepare);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'background') onLeave();
    });
    return () => subscription.remove();
  }, [onLeave]);
  return <AudioControls state={state} onLeave={onLeave} />;
}

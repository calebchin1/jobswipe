import { Text, View } from 'react-native';
import { Button, s, Tag } from '../ui';
import { Status } from '../live/ui';
import type { useAudioRoom } from './useAudioRoom';
export default function AudioControls({
  state,
  onLeave,
}: {
  state: ReturnType<typeof useAudioRoom>;
  onLeave: () => void;
}) {
  return (
    <View style={s.panel}>
      <Tag>{state.connection}</Tag>
      <Text style={s.cardTitle}>{state.muted ? 'Microphone muted' : 'Microphone on'}</Text>
      <Text style={s.body}>
        {state.participants} participant{state.participants === 1 ? '' : 's'} connected. This is
        connection status, not verified interview attendance.
      </Text>
      {!!state.error && <Status error message={state.error} />}
      <Button
        disabled={state.busy || state.connection !== 'connected'}
        label={state.muted ? 'Enable microphone' : 'Mute microphone'}
        onPress={() => {
          void state.toggleMicrophone();
        }}
      />
      {state.playbackBlocked && (
        <Button
          secondary
          label="Enable speaker audio"
          onPress={() => {
            void state.enablePlayback();
          }}
        />
      )}
      <Button secondary label="Leave audio call" onPress={onLeave} />
      <Text style={s.body}>
        Leaving ends your local audio connection. It does not mark the interview complete or reveal
        your identity.
      </Text>
    </View>
  );
}

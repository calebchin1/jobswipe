# Native audio implementation and remaining validation

LiveKit dependencies and a development audio lobby/room are now implemented. This is not a claim that Expo57/RN0.86 native media has been device-tested.

The official Expo integration requires `@livekit/react-native`, `@livekit/react-native-expo-plugin`, `@livekit/react-native-webrtc`, `@config-plugins/react-native-webrtc`, and `livekit-client`. Add `expo-dev-client` for development builds, configure both Expo plugins, initialize `registerGlobals()` once, and manage `AudioSession` start/stop around a room. Expo Go cannot load the required native modules. Verify compatible package versions against this workspace’s Expo57/RN0.86 before installation. [LiveKit Expo guide](https://docs.livekit.io/transport/sdk-platforms/expo/)

Implemented client boundary (device validation remains):

- A lobby reached from a confirmed scheduled interview: microphone permission/check, named device-zone start time, anonymous handle, conduct/accommodation information, and Join.
- An isolated native room component (`.native.tsx`) with microphone publishing, remote audio, mute, route/speaker selection where supported, connection state/reconnect, and Leave. Clean up tracks, room and audio session when leaving, signing out, or losing access. A `.web.tsx` boundary keeps the existing browser bundle free of native WebRTC imports.
- An explicit backgrounding policy, tested on real iOS/Android devices; do not promise background calls before OS capabilities and interruption handling are verified.
- No camera/recording controls. Permission configuration should request the microphone only where platform/plugin support permits; audit generated manifests/plists.

Required server boundary: a narrow authenticated join-token endpoint validates current participant membership, active application, scheduled interview, allowed join window and current suspension/withdrawal state. It issues a short-lived room-scoped token with opaque identity/handle and microphone-only publishing. LiveKit grants support source restrictions; set `canPublishSources` to microphone and deny data publication, metadata changes, administration and recording. A hidden camera control alone is not authorization. [LiveKit token grants](https://docs.livekit.io/frontends/reference/tokens-grants/)

Before enabling completion or reveal, add signature-verified, replay-safe attendance events and the separate completion policy. A client leaving a room or clicking Finish never establishes interview completion.

Acceptance: two actual devices can hear each other, mute/leave/rejoin correctly, handle denied permission and interruption, and stop publishing after cancellation/withdrawal. Server tests prove camera/screen sharing tokens cannot be obtained, unrelated users cannot join, and ending a call does not reveal identity. Test Bluetooth/headphones, speaker feedback, packet loss, and foreground/background transitions. Native media validation remains separate from browser integration tests.

import { useState } from 'react';
import { SignInSchema, SignUpSchema } from '@swipe/contracts';
import { Link, useRouter } from 'expo-router';
import { Platform, Text, TextInput, View } from 'react-native';
import { authClient, configurationError, liveRequest, useLiveAuth } from '../src/live/auth';
import { LiveScreen, Status } from '../src/live/ui';
import { Button, Heading, s } from '../src/ui';
export default function Account() {
  const auth = useLiveAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function bootstrap() {
    await liveRequest('/account/bootstrap', 'POST', { role: 'candidate' });
    router.replace('/live');
  }
  async function submit() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      signup
        ? SignUpSchema.parse({ email: email.trim(), password, role: 'candidate' })
        : SignInSchema.parse({ email: email.trim(), password });
      const supabase = authClient();
      const result = signup
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { role: 'candidate' } },
          })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message);
      setPassword('');
      if (!result.data.session) {
        setNotice('Check your email to confirm your account, then return here and sign in.');
        setSignup(false);
      } else await bootstrap();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <LiveScreen>
      <Heading
        eyebrow="YOUR CONNECTED ACCOUNT"
        title="Take the next step."
        subtitle="Sign in to your configured candidate service."
      />
      {!auth.ready ? (
        <Status message="Restoring session…" />
      ) : configurationError ? (
        <Status error message={configurationError} />
      ) : auth.session ? (
        <View style={s.panel}>
          <Text style={s.body}>
            Signed in as {auth.session.user.email}. Continue to create or open your candidate
            account.
          </Text>
          <Button
            disabled={busy}
            label="Continue to live account"
            onPress={() => {
              setBusy(true);
              setError('');
              void bootstrap()
                .catch((failure) =>
                  setError(failure instanceof Error ? failure.message : 'Account setup failed.'),
                )
                .finally(() => setBusy(false));
            }}
          />
          <Link href="/live" style={s.link}>
            Open live workspace
          </Link>
          <Button
            secondary
            disabled={busy}
            label="Sign out of this device"
            onPress={() => {
              setBusy(true);
              void auth
                .signOut()
                .catch((failure) =>
                  setError(failure instanceof Error ? failure.message : 'Sign out failed.'),
                )
                .finally(() => setBusy(false));
            }}
          />
        </View>
      ) : (
        <View style={s.panel}>
          <Text style={s.cardTitle}>{signup ? 'Create candidate account' : 'Sign in'}</Text>
          <Text style={s.label}>Email</Text>
          <TextInput
            accessibilityLabel="Account email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            style={s.input}
          />
          <Text style={s.label}>Password</Text>
          <TextInput
            accessibilityLabel="Account password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChangeText={setPassword}
            style={s.input}
          />
          <Button
            label={busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
            disabled={
              busy || !email.trim() || (signup ? password.length < 12 : password.length === 0)
            }
            onPress={() => {
              void submit();
            }}
          />
          <Button
            secondary
            disabled={busy}
            label={signup ? 'Already have an account? Sign in' : 'Create a candidate account'}
            onPress={() => {
              setSignup(!signup);
              setError('');
            }}
          />
          <Text style={s.body}>
            Use at least 12 characters for your password. Email confirmation may be required. No
            name or date of birth is collected here.
          </Text>
        </View>
      )}
      {auth.error && !configurationError && <Status error message={auth.error} />}{' '}
      {!!notice && <Status message={notice} />} {!!error && <Status error message={error} />}
      <Text style={s.body}>
        {Platform.OS === 'web'
          ? 'Browser preview keeps your session in memory only. Reloading signs you out.'
          : 'Your session is stored in encrypted device storage.'}
      </Text>
      <Text style={s.body}>
        Applying requires server-approved profile and eligibility checks. Account creation does not
        automatically approve you.
      </Text>
    </LiveScreen>
  );
}

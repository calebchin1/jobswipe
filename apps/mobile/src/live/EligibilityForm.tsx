import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Switch, Text, View } from 'react-native';
import { CandidateEligibilitySchema, type CandidateEligibility } from '@swipe/contracts';
import { liveRequest, useLiveAuth } from './auth';
import { Status } from './ui';
import { Button, s } from '../ui';

export function EligibilityForm() {
  const auth = useLiveAuth();
  const actor = auth.sessionKey;
  const current = useRef(actor);
  current.current = actor;
  const [owner, setOwner] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<CandidateEligibility | null>(null);
  const [adult, setAdult] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setOwner(null);
    setEligibility(null);
    setAdult(false);
    setAuthorized(false);
    setError('');
    setNotice('');
  }, [actor]);
  useFocusEffect(
    useCallback(() => {
      if (!actor) return;
      let active = true;
      setBusy(true);
      void liveRequest<{ eligibility: unknown }>('/candidate/eligibility')
        .then((result) => {
          const next = CandidateEligibilitySchema.parse(result.eligibility);
          if (active && current.current === actor) {
            setEligibility(next);
            setOwner(actor);
            setAdult(next.status === 'eligible');
            setAuthorized(next.status === 'eligible');
          }
        })
        .catch((failure) => {
          if (active && current.current === actor)
            setError(failure instanceof Error ? failure.message : 'Could not load eligibility.');
        })
        .finally(() => {
          if (active && current.current === actor) setBusy(false);
        });
      return () => {
        active = false;
      };
    }, [actor]),
  );
  async function save() {
    const submitting = actor;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await liveRequest<{ eligibility: unknown }>(
        '/candidate/eligibility',
        'POST',
        {
          adult,
          authorizedToWork: authorized,
          policyVersion: 'adult-pilot-v1',
        },
      );
      const next = CandidateEligibilitySchema.parse(response.eligibility);
      if (current.current === submitting) {
        setEligibility(next);
        setNotice(
          next.status === 'eligible'
            ? 'Pilot attestation saved. Your profile must also be reviewed and approved before you can apply.'
            : 'You are not enrolled as eligible for this pilot. New applications are blocked.',
        );
      }
    } catch (failure) {
      if (current.current === submitting)
        setError(failure instanceof Error ? failure.message : 'Could not save eligibility.');
    } finally {
      if (current.current === submitting) setBusy(false);
    }
  }
  return (
    <View style={s.panel}>
      <Text style={s.cardTitle}>Adults-only pilot</Text>
      <Text style={s.body}>
        This pilot is for people 18 or older who are legally authorized to work in Ontario. These
        private declarations are not included in your employer profile.
      </Text>
      {!!error && <Status error message={error} />}
      {!!notice && <Status message={notice} />}
      {owner === actor && eligibility && (
        <>
          <Text style={s.label}>Attestation: {eligibility.status.replaceAll('_', ' ')}</Text>
          {eligibility.refreshDueAt && (
            <Text style={s.body}>
              Renew by {new Date(eligibility.refreshDueAt).toLocaleDateString()}. Update your
              declaration if your circumstances change.
            </Text>
          )}
          <View style={s.row}>
            <Text style={[s.label, { flex: 1 }]}>I am 18 years old or older</Text>
            <Switch
              accessibilityLabel="I am 18 years old or older"
              value={adult}
              onValueChange={setAdult}
              disabled={busy}
            />
          </View>
          <View style={s.row}>
            <Text style={[s.label, { flex: 1 }]}>I am legally authorized to work in Ontario</Text>
            <Switch
              accessibilityLabel="I am legally authorized to work in Ontario"
              value={authorized}
              onValueChange={setAuthorized}
              disabled={busy}
            />
          </View>
          <Text style={s.context}>
            Saving without both declarations removes your pilot eligibility. Profile approval does
            not verify these declarations.
          </Text>
          <Button
            label={busy ? 'Saving eligibility…' : 'Save pilot eligibility'}
            disabled={busy}
            onPress={() => {
              void save();
            }}
          />
        </>
      )}
      {owner !== actor && !error && <Text style={s.body}>Loading eligibility…</Text>}
    </View>
  );
}

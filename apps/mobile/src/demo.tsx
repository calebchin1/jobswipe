import React, { createContext, useContext, useState } from 'react';

import { demoJobs } from '@swipe/domain';
import type { ApplicationStage, Job as JobContract } from '@swipe/contracts';

/** Presentation-only adapter over the shared, schema-validated fictional jobs. */
export type Job = {
  source: JobContract;
  id: string;
  title: string;
  company: string;
  category: string;
  pay: string;
  hours: string;
  commute: number;
  color: string;
  monogram: string;
  summary: string;
  skills: string[];
  schedule: string;
  ai: boolean;
};
const deckTitles = [
  'Your next chapter,\nwith great coffee.',
  'Find your place,\none page at a time.',
  'Make someone’s\nlightbulb moment.',
];
const cardColors = ['#F2DDCC', '#E5E4F2', '#DCE9F5'];
export const jobs: Job[] = demoJobs
  .filter((job) => job.jobType === 'Part-time')
  .map((job, index) => ({
    source: job,
    id: job.id,
    title: deckTitles[index] ?? job.title,
    company: `${job.company} · fictional`,
    category: job.title,
    pay: `$${job.payMin}–$${job.payMax} / ${job.payPeriod === 'hour' ? 'hr' : 'year'}`,
    hours: `${job.hoursPerWeek} hrs / week`,
    commute: job.commuteMinutes,
    color: cardColors[index] ?? '#E6EDDF',
    monogram: `${job.company.charAt(0).toLowerCase()}.`,
    summary: job.description,
    skills: job.skills,
    schedule: job.schedule.join(', '),
    ai: job.usesAiScreening,
  }));
export type Application = {
  jobId: string;
  stage: Extract<ApplicationStage, 'Applied' | 'Matched' | 'Withdrawn'>;
};
type Demo = {
  saved: string[];
  applications: Application[];
  dismissed: string[];
  headline: string;
  hours: string;
  visible: boolean;
  notice: string;
  apply: (id: string) => void;
  save: (id: string) => void;
  pass: (id: string) => void;
  undo: () => void;
  canUndo: boolean;
  withdraw: (id: string) => void;
  setHeadline: (value: string) => void;
  setHours: (value: string) => void;
  setVisible: (value: boolean) => void;
  reset: () => void;
};
const Context = createContext<Demo | null>(null);
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [lastPass, setLastPass] = useState<string | null>(null);
  const [undoUsed, setUndoUsed] = useState(false);
  const [headline, setHeadline] = useState('Curious math student, great with people');
  const [visible, setVisible] = useState(true);
  const [hours, setHours] = useState('12–18 hours / week');
  const [notice, setNotice] = useState('');
  const apply = (id: string) => {
    if (applications.some((a) => a.jobId === id)) return;
    setApplications((a) =>
      a.some((application) => application.jobId === id)
        ? a
        : [...a, { jobId: id, stage: 'Applied' }],
    );
    setLastPass(null);
    setNotice('Demo application added. Your identity stays hidden.');
  };
  const save = (id: string) => {
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setNotice(
      saved.includes(id) ? 'Removed from saved jobs.' : 'Saved for later. This does not apply.',
    );
  };
  const pass = (id: string) => {
    setDismissed((s) => (s.includes(id) ? s : [...s, id]));
    setLastPass(id);
    setNotice('Passed. You can undo one pass per demo session.');
  };
  const undo = () => {
    if (!lastPass || undoUsed) return;
    setDismissed((s) => s.filter((id) => id !== lastPass));
    setLastPass(null);
    setUndoUsed(true);
    setNotice('Last pass undone.');
  };
  const withdraw = (id: string) => {
    setApplications((a) => a.map((x) => (x.jobId === id ? { ...x, stage: 'Withdrawn' } : x)));
    setNotice('Demo application withdrawn.');
  };
  const reset = () => {
    setSaved([]);
    setApplications([]);
    setDismissed([]);
    setLastPass(null);
    setUndoUsed(false);
    setHeadline('Curious math student, great with people');
    setVisible(true);
    setHours('12–18 hours / week');
    setNotice('Demo reset.');
  };
  return (
    <Context.Provider
      value={{
        saved,
        applications,
        dismissed,
        headline,
        hours,
        visible,
        notice,
        apply,
        save,
        pass,
        undo,
        canUndo: !!lastPass && !undoUsed,
        withdraw,
        setHeadline,
        setHours,
        setVisible,
        reset,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error('DemoProvider missing');
  return value;
}

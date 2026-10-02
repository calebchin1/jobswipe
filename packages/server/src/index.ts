/** Server-only module: never import into mobile or a React client component. */
import { z } from 'zod';
import {
  InterviewSlotSchema,
  ScheduledInterviewSchema,
  AccountContextSchema,
  CandidateProfileSchema,
  LiveJobSchema,
  LiveApplicationSchema,
} from '@swipe/contracts';
import { CallAccessSchema } from './calls';
export { createAudioSession, livekitConfig, closeCancelledCalls } from './calls';
export { interviewCalendar } from './calendar';
export { applicationOrigin, assertSameOrigin, safeReturnPath } from './request-security';

type BackendConfig = { url: string; key: string };
export type RpcClient = {
  userId: string;
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};
export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function backendConfig(
  env: Record<string, string | undefined> = process.env,
): BackendConfig {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ApiFailure(
      503,
      'BACKEND_NOT_CONFIGURED',
      'The authenticated backend has not been configured. The UI uses fictional demo data.',
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiFailure(503, 'BACKEND_NOT_CONFIGURED', 'Backend configuration is invalid.');
  }
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
  ) {
    throw new ApiFailure(503, 'BACKEND_NOT_CONFIGURED', 'Backend configuration is invalid.');
  }
  if (key.startsWith('sb_secret_'))
    throw new ApiFailure(503, 'UNSAFE_BACKEND_KEY', 'A publishable backend key is required.');
  // Legacy JWT keys may be public anon or privileged service-role keys.
  const payload = key.split('.')[1];
  if (payload) {
    try {
      if (JSON.parse(Buffer.from(payload, 'base64url').toString()).role === 'service_role') {
        throw new ApiFailure(503, 'UNSAFE_BACKEND_KEY', 'A publishable backend key is required.');
      }
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
    }
  }
  return { url: parsed.origin, key };
}

export async function authenticatedRpc(
  request: Request,
  options: { config?: BackendConfig; fetcher?: typeof fetch } = {},
): Promise<RpcClient> {
  const header = request.headers.get('authorization');
  if (!header || !/^Bearer [A-Za-z0-9._~-]+$/.test(header))
    throw new ApiFailure(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const config = options.config ?? backendConfig();
  const fetcher = options.fetcher ?? fetch;
  const headers = { apikey: config.key, Authorization: header };
  let userResponse: Response;
  try {
    userResponse = await fetcher(`${config.url}/auth/v1/user`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiFailure(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
  }
  if (userResponse.status >= 500 || userResponse.status === 429)
    throw new ApiFailure(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
  if (!userResponse.ok)
    throw new ApiFailure(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
  const result = z.object({ id: z.uuid() }).safeParse(await userResponse.json().catch(() => null));
  if (!result.success)
    throw new ApiFailure(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
  return {
    userId: result.data.id,
    async call(name, args) {
      // Call sites choose from the exported workflow allowlist, not user-supplied RPC names.
      if (!Object.values(workflows).includes(name as Workflow))
        throw new ApiFailure(403, 'FORBIDDEN', 'This operation is unavailable.');
      let response: Response;
      try {
        response = await fetcher(`${config.url}/rest/v1/rpc/${name}`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Content-Profile': 'app',
            'Accept-Profile': 'app',
          },
          body: JSON.stringify(args),
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new ApiFailure(
          503,
          'BACKEND_UNAVAILABLE',
          'The operation could not be confirmed. Please retry.',
        );
      }
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code =
          typeof data === 'object' && data !== null && 'code' in data ? String(data.code) : '';
        if (code === '42501' || response.status === 403)
          throw new ApiFailure(403, 'FORBIDDEN', 'You do not have access to this operation.');
        if (response.status === 401)
          throw new ApiFailure(401, 'UNAUTHENTICATED', 'Sign in to continue.');
        if (code === '22023' || code === '22P02')
          throw new ApiFailure(422, 'INVALID_INPUT', 'Check the submitted values.');
        if (code === 'P0001' || code === '23505' || code === '23514')
          throw new ApiFailure(
            409,
            'STATE_CONFLICT',
            'This action is not available in the current state. Refresh and try again.',
          );
        throw new ApiFailure(
          503,
          'BACKEND_UNAVAILABLE',
          'The operation is temporarily unavailable.',
        );
      }
      return projectRpcResult(name as Workflow, data);
    },
  };
}

export const workflows = {
  approveProfileProposal: 'approve_profile_proposal',
  interviewCallAccess: 'get_interview_call_access',
  cancelledCallRooms: 'get_cancelled_call_rooms',
  createInterviewSlot: 'create_interview_slot',
  employerInterviewSlots: 'list_employer_interview_slots',
  cancelInterviewSlot: 'cancel_interview_slot',
  applicationInterviewSlots: 'list_application_interview_slots',
  bookInterview: 'book_interview',
  applicationInterviews: 'list_application_interviews',
  candidateInterviews: 'list_candidate_interviews',
  jobInterviews: 'list_job_interviews',
  cancelInterview: 'cancel_interview',
  bootstrap: 'ensure_account',
  account: 'get_account_context',
  createEmployer: 'create_employer',
  employerJobs: 'list_employer_jobs',
  saveJob: 'save_job_draft',
  publishJob: 'publish_job',
  openJobs: 'list_open_jobs',
  myApplications: 'list_my_applications',
  jobApplications: 'list_job_applications',
  candidateProfile: 'get_candidate_profile',
  saveCandidateProfile: 'save_candidate_profile',
  candidateVisibility: 'set_candidate_visibility',
  apply: 'apply_to_job',
  employerInterest: 'express_employer_interest',
  withdraw: 'withdraw_application',
  passJob: 'pass_job',
  undoJobPass: 'undo_job_pass',
  passCard: 'pass_candidate_card',
  undoCardPass: 'undo_candidate_card_pass',
  candidates: 'list_candidate_cards',
  scorecard: 'submit_scorecard',
  authorize: 'authorize_reveal',
  reveal: 'grant_reveal',
  identity: 'read_reveal',
} as const;
type Workflow = (typeof workflows)[keyof typeof workflows];

const CandidateRow = z
  .object({
    card_id: z.uuid(),
    handle: z.string(),
    headline: z.string(),
    education_level: z.string(),
    field: z.string(),
    study_status: z.string(),
    bullets: z.array(z.string()),
    skills: z.array(z.string()),
    applied: z.boolean(),
  })
  .transform((row) => ({
    cardRef: row.card_id,
    handle: row.handle,
    headline: row.headline,
    education: { level: row.education_level, field: row.field, status: row.study_status },
    bullets: row.bullets,
    skills: row.skills,
    applied: row.applied,
  }));
const IdentityRow = z
  .object({
    legal_name: z.string(),
    contact_email: z.string(),
    phone: z.string().nullable(),
    document_id: z.uuid(),
  })
  .transform((row) => ({
    displayName: row.legal_name,
    email: row.contact_email,
    phone: row.phone,
    documentId: row.document_id,
  }));

/** Allowlist projections strip unexpected fields even if a provider function changes. */
export function projectRpcResult(name: Workflow, data: unknown): unknown {
  try {
    switch (name) {
      case 'create_interview_slot':
      case 'cancel_interview_slot': return InterviewSlotSchema.parse(data);
      case 'list_employer_interview_slots':
      case 'list_application_interview_slots': return z.array(InterviewSlotSchema).parse(data);
      case 'book_interview':
      case 'cancel_interview': return ScheduledInterviewSchema.parse(data);
      case 'list_candidate_interviews':
      case 'list_job_interviews':
      case 'list_application_interviews': return z.array(ScheduledInterviewSchema).parse(data);
      case 'ensure_account':
      case 'get_account_context':
        return AccountContextSchema.parse(data);
      case 'list_employer_jobs':
      case 'list_open_jobs':
        return z.array(LiveJobSchema).parse(data);
      case 'list_my_applications':
      case 'list_job_applications':
        return z.array(LiveApplicationSchema).parse(data);
      case 'get_cancelled_call_rooms': return z.array(z.uuid()).parse(data);
      case 'get_interview_call_access': return CallAccessSchema.parse(data);
      case 'approve_profile_proposal':
      case 'get_candidate_profile':
      case 'save_candidate_profile':
      case 'set_candidate_visibility':
        return CandidateProfileSchema.parse(data);
      case 'list_candidate_cards':
        return z.array(CandidateRow).parse(data);
      case 'read_reveal':
        return z.array(IdentityRow).max(1).parse(data)[0] ?? null;
      case 'withdraw_application':
      case 'pass_job':
      case 'undo_job_pass':
      case 'pass_candidate_card':
      case 'undo_candidate_card_pass':
        return null;
      case 'express_employer_interest':
        return z.uuid().nullable().parse(data);
      default:
        return z.uuid().parse(data);
    }
  } catch {
    throw new ApiFailure(
      503,
      'INVALID_BACKEND_RESPONSE',
      'The operation returned an unexpected result.',
    );
  }
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApiFailure(415, 'JSON_REQUIRED', 'Send an application/json request.');
  if (!request.body) throw new ApiFailure(400, 'INVALID_JSON', 'A JSON body is required.');
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiFailure(413, 'BODY_TOO_LARGE', 'This request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiFailure(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
}

export function safeJson(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function apiBoundary(run: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await run();
    return result instanceof Response ? result : safeJson(result);
  } catch (error) {
    const requestId = crypto.randomUUID();
    if (error instanceof z.ZodError)
      return safeJson(
        {
          error: {
            code: 'INVALID_INPUT',
            message: 'Check the submitted values.',
            requestId,
            fieldErrors: z.flattenError(error).fieldErrors,
          },
        },
        422,
      );
    if (error instanceof ApiFailure)
      return safeJson(
        { error: { code: error.code, message: error.message, requestId } },
        error.status,
      );
    // Never send underlying SQL/provider payloads, credentials or candidate fields to the browser.
    console.error('api.unexpected_failure', {
      requestId,
      type: error instanceof Error ? error.name : 'unknown',
      frames: error instanceof Error ? error.stack?.split('\n').slice(1, 5).join('\n') : undefined,
    });
    return safeJson(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong. Please try again.',
          requestId,
        },
      },
      500,
    );
  }
}

export { z };

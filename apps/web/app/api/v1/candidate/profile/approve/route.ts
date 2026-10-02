import { withActor } from '../../../../../../src/server/session';
import { ApproveProfileProposalSchema } from '@swipe/contracts';
import { readJson,workflows } from '@swipe/server';
export async function POST(request:Request) {return withActor(request,async client=>({profile:await client.call(workflows.approveProfileProposal,{p_proposal:ApproveProfileProposalSchema.parse(await readJson(request)).proposalId})}));}

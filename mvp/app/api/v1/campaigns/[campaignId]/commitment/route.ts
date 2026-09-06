import {
  accountDatabase,
  assertAccountJsonRequestHeaders,
  authorizeAccount,
  readAccountJsonBody,
} from '@/lib/account-server';
import {
  parseCommitmentMutationInput,
  pledgeInputFromMutation,
  TEAM_REQUEST_BODY_MAX_BYTES,
} from '@/lib/team-contract';
import {
  missingTeamDatabaseResponse,
  teamErrorResponse,
  type TeamDatabase,
  upsertTeamCommitment,
  withdrawTeamCommitment,
} from '@/lib/team-server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const database = accountDatabase() as TeamDatabase | null;
  if (!database) return missingTeamDatabaseResponse();
  try {
    await assertAccountJsonRequestHeaders(request, TEAM_REQUEST_BODY_MAX_BYTES);
    const input = parseCommitmentMutationInput(
      await readAccountJsonBody(request, TEAM_REQUEST_BODY_MAX_BYTES),
    );
    const session = await authorizeAccount(database, request);
    const { campaignId } = await context.params;
    const pledgeInput = pledgeInputFromMutation(input);
    const campaign = pledgeInput
      ? await upsertTeamCommitment(
          database,
          session.user.id,
          campaignId,
          pledgeInput,
        )
      : await withdrawTeamCommitment(database, session.user.id, campaignId);
    return Response.json(
      { campaign },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

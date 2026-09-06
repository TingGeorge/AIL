import {
  accountDatabase,
  assertAccountJsonRequestHeaders,
  authorizeAccount,
  readAccountJsonBody,
} from '@/lib/account-server';
import { TEAM_REQUEST_BODY_MAX_BYTES } from '@/lib/team-contract';
import {
  missingTeamDatabaseResponse,
  redeemTeamInvite,
  teamErrorResponse,
  type TeamDatabase,
} from '@/lib/team-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const database = accountDatabase() as TeamDatabase | null;
  if (!database) return missingTeamDatabaseResponse();
  try {
    await assertAccountJsonRequestHeaders(request, TEAM_REQUEST_BODY_MAX_BYTES);
    const input = await readAccountJsonBody(
      request,
      TEAM_REQUEST_BODY_MAX_BYTES,
    );
    const session = await authorizeAccount(database, request);
    return Response.json(
      await redeemTeamInvite(database, session.user.id, input),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

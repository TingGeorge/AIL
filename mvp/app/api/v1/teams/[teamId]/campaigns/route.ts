import {
  accountDatabase,
  assertAccountJsonRequestHeaders,
  authorizeAccount,
  readAccountJsonBody,
} from '@/lib/account-server';
import { TEAM_REQUEST_BODY_MAX_BYTES } from '@/lib/team-contract';
import {
  createTeamCampaign,
  listTeamCampaignsForUser,
  missingTeamDatabaseResponse,
  teamErrorResponse,
  type TeamDatabase,
} from '@/lib/team-server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const database = accountDatabase() as TeamDatabase | null;
  if (!database) return missingTeamDatabaseResponse();
  try {
    const session = await authorizeAccount(database, request);
    const { teamId } = await context.params;
    return Response.json(
      {
        campaigns: await listTeamCampaignsForUser(
          database,
          session.user.id,
          teamId,
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const database = accountDatabase() as TeamDatabase | null;
  if (!database) return missingTeamDatabaseResponse();
  try {
    await assertAccountJsonRequestHeaders(request, TEAM_REQUEST_BODY_MAX_BYTES);
    const input = await readAccountJsonBody(
      request,
      TEAM_REQUEST_BODY_MAX_BYTES,
    );
    const session = await authorizeAccount(database, request);
    const { teamId } = await context.params;
    return Response.json(
      {
        campaign: await createTeamCampaign(
          database,
          session.user.id,
          teamId,
          input,
        ),
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

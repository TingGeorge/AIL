import {
  accountDatabase,
  assertAccountJsonRequestHeaders,
  authorizeAccount,
  readAccountJsonBody,
} from '@/lib/account-server';
import { TEAM_REQUEST_BODY_MAX_BYTES } from '@/lib/team-contract';
import {
  createTeam,
  listTeamsForUser,
  missingTeamDatabaseResponse,
  teamErrorResponse,
  type TeamDatabase,
} from '@/lib/team-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const database = accountDatabase() as TeamDatabase | null;
  if (!database) return missingTeamDatabaseResponse();
  try {
    const session = await authorizeAccount(database, request);
    return Response.json(
      { teams: await listTeamsForUser(database, session.user.id) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

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
      { team: await createTeam(database, session.user.id, input) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

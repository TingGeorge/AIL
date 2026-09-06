import { accountDatabase, authorizeAccount } from '@/lib/account-server';
import {
  missingTeamDatabaseResponse,
  readTeamForUser,
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
      { team: await readTeamForUser(database, session.user.id, teamId) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

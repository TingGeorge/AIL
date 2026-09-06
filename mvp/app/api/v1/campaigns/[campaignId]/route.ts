import { accountDatabase, authorizeAccount } from '@/lib/account-server';
import {
  missingTeamDatabaseResponse,
  readTeamCampaign,
  teamErrorResponse,
  type TeamDatabase,
} from '@/lib/team-server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const database = accountDatabase() as TeamDatabase | null;
  if (!database) return missingTeamDatabaseResponse();
  try {
    const session = await authorizeAccount(database, request);
    const { campaignId } = await context.params;
    return Response.json(
      {
        campaign: await readTeamCampaign(database, session.user.id, campaignId),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return teamErrorResponse(error);
  }
}

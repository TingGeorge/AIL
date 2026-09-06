import {
  accountDatabase,
  accountErrorResponse,
  missingAccountDatabaseResponse,
  revokeAccountSession,
} from '@/lib/account-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const database = accountDatabase();
  if (!database) return missingAccountDatabaseResponse();
  try {
    await revokeAccountSession(database, request);
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

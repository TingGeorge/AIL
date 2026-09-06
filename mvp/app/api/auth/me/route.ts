import {
  accountDatabase,
  accountErrorResponse,
  accountMe,
  missingAccountDatabaseResponse,
} from '@/lib/account-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const database = accountDatabase();
  if (!database) return missingAccountDatabaseResponse();
  try {
    return Response.json(await accountMe(database, request), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

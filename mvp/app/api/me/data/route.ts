import {
  accountDatabase,
  accountErrorResponse,
  accountMe,
  missingAccountDatabaseResponse,
  writeAccountData,
} from '@/lib/account-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const database = accountDatabase();
  if (!database) return missingAccountDatabaseResponse();
  try {
    return Response.json((await accountMe(database, request)).data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const database = accountDatabase();
  if (!database) return missingAccountDatabaseResponse();
  try {
    const body = (await request.json()) as { state?: unknown };
    return Response.json(
      await writeAccountData(database, request, body?.state),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return accountErrorResponse(error);
  }
}

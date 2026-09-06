import {
  accountDatabase,
  accountErrorResponse,
  loginAccount,
  missingAccountDatabaseResponse,
} from '@/lib/account-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const database = accountDatabase();
  if (!database) return missingAccountDatabaseResponse();
  try {
    const input = (await request.json()) as unknown;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json(
        { error: 'invalid_request', message: '登入資料格式不正確。' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(
      await loginAccount(database, input as Record<string, unknown>),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return accountErrorResponse(error);
  }
}

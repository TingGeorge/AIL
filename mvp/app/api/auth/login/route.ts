import {
  accountDatabase,
  accountErrorResponse,
  assertAccountJsonRequestHeaders,
  enforceAccountAuthRateLimit,
  loginAccount,
  missingAccountDatabaseResponse,
  readAccountJsonBody,
} from '@/lib/account-server';
import { ACCOUNT_AUTH_BODY_MAX_BYTES } from '@/lib/account-contract';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const database = accountDatabase();
  if (!database) return missingAccountDatabaseResponse();
  try {
    await assertAccountJsonRequestHeaders(request, ACCOUNT_AUTH_BODY_MAX_BYTES);
    await enforceAccountAuthRateLimit(database, request, 'login');
    const input = await readAccountJsonBody(
      request,
      ACCOUNT_AUTH_BODY_MAX_BYTES,
    );
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

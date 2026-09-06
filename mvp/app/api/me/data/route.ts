import {
  accountDatabase,
  accountErrorResponse,
  accountMe,
  assertAccountJsonRequestHeaders,
  authorizeAccount,
  missingAccountDatabaseResponse,
  readAccountJsonBody,
  writeAccountDataForUser,
} from '@/lib/account-server';
import { ACCOUNT_STATE_BODY_MAX_BYTES } from '@/lib/account-contract';

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
    await assertAccountJsonRequestHeaders(
      request,
      ACCOUNT_STATE_BODY_MAX_BYTES,
    );
    const session = await authorizeAccount(database, request);
    const input = await readAccountJsonBody(
      request,
      ACCOUNT_STATE_BODY_MAX_BYTES,
    );
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json(
        { error: 'invalid_request', message: '帳號資料格式不正確。' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const body = input as { state?: unknown; revision?: unknown };
    return Response.json(
      await writeAccountDataForUser(
        database,
        session.user.id,
        body.state,
        body.revision,
      ),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return accountErrorResponse(error);
  }
}

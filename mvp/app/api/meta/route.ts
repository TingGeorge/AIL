import { env } from 'cloudflare:workers';
import { createBuildInfo, type BuildEnvironment } from '@/lib/build-info';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    createBuildInfo(env as unknown as BuildEnvironment, process.env),
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

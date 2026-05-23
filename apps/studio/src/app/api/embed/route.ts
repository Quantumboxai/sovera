import { proxyFunctions } from '@/lib/proxy';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await req.text();
  return proxyFunctions('embed', { method: 'POST', body });
}

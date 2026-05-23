import { proxyFunctions } from '@/lib/proxy';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET()  { return proxyFunctions('blob/containers'); }
export async function POST(req: Request) {
  const body = await req.text();
  return proxyFunctions('blob/containers', { method: 'POST', body });
}

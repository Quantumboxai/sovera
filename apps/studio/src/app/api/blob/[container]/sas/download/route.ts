import { proxyFunctions } from '@/lib/proxy';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req: Request, ctx: { params: Promise<{ container: string }> }) {
  const { container } = await ctx.params;
  const url = new URL(req.url);
  return proxyFunctions(`blob/${encodeURIComponent(container)}/sas/download`, { query: { name: url.searchParams.get('name') ?? undefined } });
}

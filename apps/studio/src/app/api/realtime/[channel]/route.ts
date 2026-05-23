import { proxyFunctions } from '@/lib/proxy';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(_req: Request, ctx: { params: Promise<{ channel: string }> }) {
  const { channel } = await ctx.params;
  return proxyFunctions(`realtime/${encodeURIComponent(channel)}`);
}

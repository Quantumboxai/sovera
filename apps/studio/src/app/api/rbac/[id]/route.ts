import { proxyFunctions } from '@/lib/proxy';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyFunctions(`rbac/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

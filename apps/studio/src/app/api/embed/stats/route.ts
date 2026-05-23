import { proxyFunctions } from '@/lib/proxy';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() { return proxyFunctions('embed/stats'); }

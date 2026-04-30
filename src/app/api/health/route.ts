import { NextResponse } from 'next/server';
import pkg from '../../../../package.json' with { type: 'json' };

/**
 * GET /api/_health
 *
 * Endpoint de sante minimal pour P0. Etendu en P4 pour pinguer Supabase
 * et Sellsy (cf. SPEC §11 P4).
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    name: pkg.name,
    version: pkg.version,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}

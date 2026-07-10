/**
 * MDS-Prospection-SignupNotifs+Badge — count signups non vus pour l'admin
 * connecte (badge sidebar "Inscriptions web", polling 30s). 0 si sales ou
 * non authentifie (RLS bloque de toute facon, check explicite en plus pour
 * eviter le roundtrip DB — cf. pattern /api/admin/emails/unread-count).
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { countUnviewedSignups } from '@/app/admin/(authenticated)/signups/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const profile = await requireAdminProfile();
    if (profile.role === 'sales') return NextResponse.json({ count: 0 });
    const count = await countUnviewedSignups();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

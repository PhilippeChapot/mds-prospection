/**
 * P12.x.EmailIntegration — count emails non lus pour l'admin connecté (badge
 * sidebar, polling 30s). Renvoie 0 si non authentifié.
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { countUnreadForUser } from '@/lib/admin/emails/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const profile = await requireAdminProfile();
    if (profile.role === 'sales') return NextResponse.json({ count: 0 });
    const count = await countUnreadForUser(profile.id);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

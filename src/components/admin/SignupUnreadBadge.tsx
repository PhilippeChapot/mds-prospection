'use client';

/**
 * MDS-Prospection-SignupNotifs+Badge — badge "non vus" dans la sidebar pour
 * "Inscriptions web". Meme pattern que EmailUnreadBadge (polling 30s, pas
 * de dependance SWR).
 */

import { useEffect, useState } from 'react';

export function SignupUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/admin/signups/unread-count', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { count?: number };
        if (active) setCount(json.count ?? 0);
      } catch {
        /* silencieux */
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="bg-md-magenta rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
}

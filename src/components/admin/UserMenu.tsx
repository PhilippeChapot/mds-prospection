'use client';

import { useTransition } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { signOutAction } from '@/app/admin/(authenticated)/actions';
import { cn } from '@/lib/utils';

function initials(input: string): string {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu({
  fullName,
  email,
  role,
}: {
  fullName: string | null;
  email: string;
  role: 'admin' | 'sales' | string;
}) {
  const [pending, startTransition] = useTransition();
  const display = fullName?.trim() || email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1 pr-3 pl-1',
          'transition hover:bg-white/15',
          'focus-visible:ring-md-magenta/60 focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <Avatar className="size-7">
          <AvatarFallback className="bg-md-magenta text-[10px] font-bold text-white">
            {initials(display)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-xs font-semibold text-white sm:inline">{display}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-md-text text-sm font-semibold">{display}</span>
          <span className="text-md-text-muted truncate text-xs font-normal">{email}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <div className="text-md-text-muted flex items-center gap-2 px-2 py-1.5 text-xs">
          <ShieldCheck className="size-3.5" aria-hidden />
          <span>
            Role : <strong className="text-md-text font-semibold">{role}</strong>
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(() => signOutAction());
          }}
        >
          <LogOut className="size-4" aria-hidden />
          <span>{pending ? 'Deconnexion…' : 'Se deconnecter'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

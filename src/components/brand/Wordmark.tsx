import { cn } from '@/lib/utils';

/**
 * Wordmark "mediada{y}s" — fallback HTML/CSS au cas ou le SVG officiel
 * ne charge pas. Le `y` est en magenta MD, italique, decale de -3px.
 * SPEC §3.30 + DESIGN-TOKENS §4.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('wordmark text-2xl', className)} aria-label="mediadays">
      mediada<span className="y">y</span>s
    </span>
  );
}

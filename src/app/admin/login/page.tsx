import { HeaderLogo } from '@/components/brand/HeaderLogo';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: 'Connexion',
  description: 'Connexion a la console admin MDS Prospection.',
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Acces non autorise. Votre compte n’a pas les droits admin.',
  expired: 'Session expiree. Reconnectez-vous.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/admin') ? params.next : '/admin';
  const prefilledError = params.error ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <main className="from-md-blue-deep via-md-blue-dark to-md-blue flex min-h-svh flex-col bg-gradient-to-br">
      <header className="px-6 pt-8 sm:px-10">
        <HeaderLogo theme="dark" size={36} />
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <span className="text-md-magenta-soft text-xs font-bold tracking-[0.2em] uppercase">
              Console admin
            </span>
            <h1 className="mt-2 font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-white">
              MDS Prospection
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Connectez-vous pour acceder au pipeline 2026.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <LoginForm next={next} prefilledError={prefilledError} />
          </div>

          <p className="mt-6 text-center text-xs text-white/40">
            Editions HF · Paris Radio Show & MediaDays Solutions
          </p>
        </div>
      </div>
    </main>
  );
}

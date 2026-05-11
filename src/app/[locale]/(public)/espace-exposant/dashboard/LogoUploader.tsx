'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadCompanyLogoAction } from './actions';

interface LogoUploaderProps {
  currentLogoUrl: string | null;
  companyName: string;
}

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function LogoUploader({ currentLogoUrl, companyName }: LogoUploaderProps) {
  const t = useTranslations('espaceExposant.dashboard.logoUploader');
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    inputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Validation client (re-checked cote server pour la securite).
    if (file.size > MAX_LOGO_SIZE) {
      setError(t('error.tooLarge'));
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('error.invalidType'));
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('logo', file);
      const result = await uploadCompanyLogoAction(formData);
      if (result.ok) {
        setPreviewUrl(result.logoUrl);
      } else {
        const map: Record<string, string> = {
          unauthorized: t('error.unauthorized'),
          invalid_session: t('error.unauthorized'),
          forbidden: t('error.unauthorized'),
          no_file: t('error.noFile'),
          file_too_large: t('error.tooLarge'),
          invalid_type: t('error.invalidType'),
          storage_error: t('error.upload'),
          db_error: t('error.upload'),
        };
        setError(map[result.error] ?? t('error.upload'));
      }
      // Reset input pour permettre re-upload du meme fichier.
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="border-md-border bg-md-bg-soft flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Logo ${companyName}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImageIcon className="text-md-text-muted size-8" aria-hidden />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleFileChange}
            disabled={pending}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t('uploading')}
              </>
            ) : (
              <>
                <Upload className="size-3.5" aria-hidden />
                {previewUrl ? t('replace') : t('upload')}
              </>
            )}
          </Button>
          <p className="text-md-text-muted text-xs">{t('hint')}</p>
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

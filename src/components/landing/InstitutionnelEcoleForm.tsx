'use client';

/**
 * P6.x.4-a — modale shadcn Dialog pour soumettre une demande de tarif
 * Institutionnel/École depuis la landing publique.
 *
 * P6.x.4-a-ter : labels + validations + toasts via next-intl
 * (clés sous landing.form.*).
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { createLeadFromLandingForm } from '@/lib/landing/lead-actions';
import type { RequestType } from '@/lib/resend/templates/institutionnel-ecole-request';

export function InstitutionnelEcoleForm({
  open,
  onOpenChange,
  type,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: RequestType;
}) {
  const t = useTranslations('landing.form');
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const formSchema = useMemo(
    () =>
      z.object({
        org_name: z.string().trim().min(2, t('validationMinLength')).max(200),
        contact_name: z.string().trim().min(2, t('validationMinLength')).max(120),
        contact_email: z.string().trim().email(t('validationEmail')).max(180),
        contact_phone: z.string().trim().max(40).optional(),
        website: z.string().trim().max(300).optional(),
        message: z.string().trim().max(4000).optional(),
      }),
    [t],
  );

  type FormValues = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      org_name: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      website: '',
      message: '',
    },
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  function onSubmit(values: FormValues) {
    setSubmitting(true);
    startTransition(async () => {
      try {
        const result = await createLeadFromLandingForm({
          type,
          org_name: values.org_name,
          contact_name: values.contact_name,
          contact_email: values.contact_email,
          contact_phone: values.contact_phone ?? '',
          website: values.website ?? '',
          message: values.message ?? '',
        });
        if (result.ok) {
          toast.success(t('toastSuccess'));
          onOpenChange(false);
        } else {
          toast.error(result.error || t('toastErrorFallback'));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('toastErrorUnknown'));
      } finally {
        setSubmitting(false);
      }
    });
  }

  const title = type === 'institutionnel' ? t('titleInstitutionnel') : t('titleEcole');
  const description =
    type === 'institutionnel' ? t('descriptionInstitutionnel') : t('descriptionEcole');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div>
            <Label htmlFor="org_name">
              {t('fieldOrgName')} <span className="text-md-magenta">*</span>
            </Label>
            <Input id="org_name" autoComplete="organization" {...register('org_name')} />
            {errors.org_name ? (
              <p className="text-md-magenta mt-1 text-xs">{errors.org_name.message}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact_name">
                {t('fieldContactName')} <span className="text-md-magenta">*</span>
              </Label>
              <Input id="contact_name" autoComplete="name" {...register('contact_name')} />
              {errors.contact_name ? (
                <p className="text-md-magenta mt-1 text-xs">{errors.contact_name.message}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="contact_email">
                {t('fieldContactEmail')} <span className="text-md-magenta">*</span>
              </Label>
              <Input
                id="contact_email"
                type="email"
                autoComplete="email"
                {...register('contact_email')}
              />
              {errors.contact_email ? (
                <p className="text-md-magenta mt-1 text-xs">{errors.contact_email.message}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact_phone">{t('fieldContactPhone')}</Label>
              <Input id="contact_phone" autoComplete="tel" {...register('contact_phone')} />
            </div>
            <div>
              <Label htmlFor="website">{t('fieldWebsite')}</Label>
              <Input id="website" placeholder="https://" {...register('website')} />
            </div>
          </div>
          <div>
            <Label htmlFor="message">{t('fieldMessage')}</Label>
            <Textarea
              id="message"
              rows={4}
              placeholder={t('messagePlaceholder')}
              {...register('message')}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-md-magenta hover:bg-md-magenta/90"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  {t('submitting')}
                </>
              ) : (
                t('submit')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

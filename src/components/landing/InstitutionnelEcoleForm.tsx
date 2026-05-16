'use client';

/**
 * P6.x.4-a — modale shadcn Dialog pour soumettre une demande de tarif
 * Institutionnel/École depuis la landing publique.
 *
 * Le `type` est piloté par le parent (depuis le contexte) — quand on
 * ouvre depuis le Sheet d'une famille "Institutionnels & Syndicats",
 * type='institutionnel' ; idem 'ecole' pour "Écoles & Formation".
 */

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import { submitInstitutionnelEcoleRequest } from '@/lib/landing/institutionnel-ecole-actions';
import type { RequestType } from '@/lib/resend/templates/institutionnel-ecole-request';

const formSchema = z.object({
  org_name: z.string().trim().min(2, 'Minimum 2 caractères').max(200),
  contact_name: z.string().trim().min(2, 'Minimum 2 caractères').max(120),
  contact_email: z.string().trim().email('Email invalide').max(180),
  contact_phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(300).optional(),
  message: z.string().trim().max(4000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const TYPE_HEADERS: Record<RequestType, { title: string; description: string }> = {
  institutionnel: {
    title: 'Demander un tarif Institutionnel',
    description:
      'Syndicats, fédérations, organismes professionnels : décrivez votre intérêt pour MediaDays Solutions. Notre équipe revient vers vous sous 48h.',
  },
  ecole: {
    title: 'Demander un tarif École',
    description:
      'Écoles, formations supérieures, organismes de formation continue : précisez votre projet d’accès. Notre équipe revient vers vous sous 48h.',
  },
};

export function InstitutionnelEcoleForm({
  open,
  onOpenChange,
  type,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: RequestType;
}) {
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

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

  // Reset form on close
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  function onSubmit(values: FormValues) {
    setSubmitting(true);
    startTransition(async () => {
      try {
        const result = await submitInstitutionnelEcoleRequest({
          type,
          org_name: values.org_name,
          contact_name: values.contact_name,
          contact_email: values.contact_email,
          contact_phone: values.contact_phone ?? '',
          website: values.website ?? '',
          message: values.message ?? '',
        });
        if (result.ok) {
          toast.success('Demande envoyée — nous revenons vers vous sous 48h.');
          onOpenChange(false);
        } else {
          toast.error(result.error || 'Échec de l’envoi.');
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur inconnue.');
      } finally {
        setSubmitting(false);
      }
    });
  }

  const header = TYPE_HEADERS[type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{header.title}</DialogTitle>
          <DialogDescription>{header.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div>
            <Label htmlFor="org_name">
              Organisation <span className="text-md-magenta">*</span>
            </Label>
            <Input id="org_name" autoComplete="organization" {...register('org_name')} />
            {errors.org_name ? (
              <p className="text-md-magenta mt-1 text-xs">{errors.org_name.message}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact_name">
                Nom complet <span className="text-md-magenta">*</span>
              </Label>
              <Input id="contact_name" autoComplete="name" {...register('contact_name')} />
              {errors.contact_name ? (
                <p className="text-md-magenta mt-1 text-xs">{errors.contact_name.message}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="contact_email">
                Email <span className="text-md-magenta">*</span>
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
              <Label htmlFor="contact_phone">Téléphone</Label>
              <Input id="contact_phone" autoComplete="tel" {...register('contact_phone')} />
            </div>
            <div>
              <Label htmlFor="website">Site web</Label>
              <Input id="website" placeholder="https://" {...register('website')} />
            </div>
          </div>
          <div>
            <Label htmlFor="message">Message (optionnel)</Label>
            <Textarea
              id="message"
              rows={4}
              placeholder="Décrivez votre intérêt pour MediaDays Solutions / vos besoins"
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
              Annuler
            </Button>
            <Button
              type="submit"
              className="bg-md-magenta hover:bg-md-magenta/90"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Envoi…
                </>
              ) : (
                'Envoyer la demande'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

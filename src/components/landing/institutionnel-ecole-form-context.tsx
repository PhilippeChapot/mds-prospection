'use client';

/**
 * P6.x.4-a — context partagé pour ouvrir le form Institutionnel/École
 * depuis n'importe quel composant landing (PoleDetailSheet,
 * VisitorFamilyDetailSheet…).
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { InstitutionnelEcoleForm } from './InstitutionnelEcoleForm';
import type { RequestType } from '@/lib/resend/templates/institutionnel-ecole-request';

interface FormContextValue {
  openForm: (type: RequestType) => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export function useInstitutionnelEcoleForm(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) {
    throw new Error('useInstitutionnelEcoleForm must be inside <InstitutionnelEcoleFormProvider>');
  }
  return ctx;
}

export function InstitutionnelEcoleFormProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RequestType>('institutionnel');

  const openForm = useCallback((t: RequestType) => {
    setType(t);
    setOpen(true);
  }, []);

  return (
    <FormContext.Provider value={{ openForm }}>
      {children}
      <InstitutionnelEcoleForm open={open} onOpenChange={setOpen} type={type} />
    </FormContext.Provider>
  );
}

/**
 * P5.x.CompanyContactsConvertedBadge — décide le lien "Convertir" vs
 * "✓ Converti" d'un contact selon l'existence d'un prospect rattaché. Pur.
 */

export interface ContactConversion {
  converted: boolean;
  href: string;
  label: string;
}

export function contactConversionLink(c: {
  id: string;
  latest_prospect_id: string | null;
}): ContactConversion {
  if (c.latest_prospect_id) {
    return {
      converted: true,
      href: `/admin/prospects/${c.latest_prospect_id}`,
      label: '✓ Converti',
    };
  }
  return {
    converted: false,
    href: `/admin/prospects/new?contact_id=${c.id}`,
    label: 'Convertir',
  };
}

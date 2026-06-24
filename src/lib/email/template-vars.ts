/**
 * P12.x.EmailIntegration — remplacement de variables de template
 * ({contact.first_name}, {company.name}, {prospect.amount}). Pur, testable.
 */

export function applyTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z._]+)\}/gi, (m, key) => vars[key] ?? m);
}

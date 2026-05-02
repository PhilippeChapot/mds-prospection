/**
 * hCaptcha server-side token verification.
 * Doc : https://docs.hcaptcha.com/#verify-the-user-response-server-side
 */

const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';

// Cles "test" universelles documentees par hCaptcha — toujours valides en dev.
const TEST_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001';
const TEST_SECRET = '0x0000000000000000000000000000000000000000';

export interface HCaptchaVerifyResult {
  success: boolean;
  hostname?: string;
  errorCodes?: string[];
}

/**
 * Verifie un token hCaptcha cote server.
 *
 * En mode dev (HCAPTCHA_SECRET = secret de test universel ou non defini),
 * on accepte n'importe quel token non vide pour debloquer le local sans
 * configurer hCaptcha. Aucun bypass en prod : si la secret prod est
 * configuree, l'API hCaptcha tranche.
 */
export async function verifyHCaptchaToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<HCaptchaVerifyResult> {
  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  const secret = process.env.HCAPTCHA_SECRET;

  // Bypass dev : pas de secret configuree -> on laisse passer tout token non vide.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { success: false, errorCodes: ['missing-input-secret'] };
    }
    return { success: true };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  let response: Response;
  try {
    response = await fetch(HCAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return { success: false, errorCodes: ['network-error'] };
  }

  if (!response.ok) {
    return { success: false, errorCodes: [`http-${response.status}`] };
  }

  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    hostname?: string;
    'error-codes'?: string[];
  };

  // En dev avec la cle de test universelle, hCaptcha repond toujours success: true
  // pour le secret 0x000... Aucune logique speciale necessaire ici.
  return {
    success: Boolean(data.success),
    hostname: data.hostname,
    errorCodes: data['error-codes'],
  };
}

export const HCAPTCHA_TEST_KEYS = {
  siteKey: TEST_SITE_KEY,
  secret: TEST_SECRET,
} as const;

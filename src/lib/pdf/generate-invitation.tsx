/**
 * P15.4 / P15.4-bis — génération du PDF lettre d'invitation (server-only).
 * Charge les logos blancs depuis public/brand (base64) pour le bandeau marine,
 * avec fallback silencieux (texte) si lecture impossible.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvitationLetterDocument, type InvitationLetterProps } from './visitor-invitation-letter';

function loadLogoDataUri(filename: string): string | null {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'brand', filename));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Mémoïsé au niveau module (lecture une seule fois par instance serveur).
let logosCache: { mds: string | null; prs: string | null } | undefined;
function getLogos(): { mds: string | null; prs: string | null } {
  if (!logosCache) {
    logosCache = {
      mds: loadLogoDataUri('MDSLogo_final_blanc_ligne.png'),
      prs: loadLogoDataUri('PRS-LogoBlanc-email-2x.png'),
    };
  }
  return logosCache;
}

export async function generateInvitationPdf(
  input: Omit<InvitationLetterProps, 'logos'>,
): Promise<Buffer> {
  return renderToBuffer(<InvitationLetterDocument {...input} logos={getLogos()} />);
}

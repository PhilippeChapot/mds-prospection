/**
 * P15.4 — génération du PDF lettre d'invitation (server-only).
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { InvitationLetterDocument, type InvitationLetterProps } from './visitor-invitation-letter';

export async function generateInvitationPdf(input: InvitationLetterProps): Promise<Buffer> {
  return renderToBuffer(<InvitationLetterDocument {...input} />);
}

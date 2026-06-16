/**
 * P15.4 — lettre d'invitation officielle visa (React-PDF, bilingue FR/EN).
 * Contenu fourni par Phil (2026-06-15), reproduit fidèlement. Signature texte
 * (V1) : « Philippe Chapot, Directeur du Paris Radio Show », émise depuis BRIVE.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 50, fontSize: 11, fontFamily: 'Helvetica', color: '#111' },
  header: { fontSize: 10, textAlign: 'right', marginBottom: 24 },
  recipientBlock: { marginBottom: 24 },
  recipientLine: { marginBottom: 3 },
  attention: { marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginVertical: 24,
    textTransform: 'uppercase',
  },
  paragraph: { marginBottom: 12, lineHeight: 1.5, textAlign: 'justify' },
  signature: { marginTop: 32 },
  signatureName: { fontFamily: 'Helvetica-Bold' },
});

export type InvitationRecipient = {
  company_name: string;
  company_full_address: string;
  postal_code: string;
  city: string;
  country: string;
  nationality: string;
  birth_date: string;
  birth_place?: string | null;
  profession: string;
  passport_number: string;
  passport_issue_date: string;
  passport_expiry: string;
};

export type InvitationLetterProps = {
  locale: 'fr' | 'en';
  generatedDate: string;
  recipient: InvitationRecipient;
};

const TEXTS_FR = {
  header: (date: string) => `BRIVE, le ${date}`,
  attention: "À l'attention de :",
  labels: {
    company: 'Nom de la Société :',
    address: 'Adresse complète de la Société :',
    postal_code: 'Code postal :',
    city: 'Ville :',
    country: 'Pays :',
    nationality: 'Nationalité :',
    birth_date: 'Date de naissance :',
    profession: 'Profession :',
    passport_number: 'Passeport n° :',
    passport_issue: 'Passeport délivré le :',
    passport_expiry: 'Passeport expire le :',
  },
  title: 'INVITATION OFFICIELLE',
  greeting: 'Madame, Monsieur,',
  paragraphs: [
    'Nous vous invitons par la présente à assister officiellement au Paris Radio Show/Mediadays Solutions qui se tiendra le mardi 15 décembre 2026 à partir de 10h au Carrousel du Louvre au 99 Rue de Rivoli, 75001 Paris.',
    "Ce salon offre aux visiteurs professionnels des tables rondes et masterclass sur tous les métiers des médias, de la radio, de l'audio digital au niveau technique, antenne, stratégie, AI, Podcast et monétisation. Vous pouvez rencontrer les fabricants de matériel, les sociétés d'habillage sonore, les consultants aux programmes, les acteurs de la monétisation, du podcast, les prestataires de services, les opérateurs de diffusion, les éditeurs de logiciels et tout produits ou services dans le secteur de tous les métiers des médias, de la radio, du podcast et sa diffusion ou production.",
    'Nous serions très heureux de pouvoir vous accueillir à notre salon. Nous précisons que ce salon est gratuit pour les professionnels (en dehors des fournisseurs) et se terminera le mardi 15 décembre 2026 à 19h.',
    "Nous aimerions aussi préciser que le voyage, le logement et tous les frais divers sont à votre propre charge. Le Paris Radio Show/Mediadays Solutions n'a aucun budget pour le financement de la venue de professionnels ou intervenants. Au-delà de cette invitation officielle, nous vous prions de bien vouloir faire votre demande de badge sur le site officiel des Mediadays : https://www.mediadays.net.",
    "Dans l'attente de vous rencontrer sur le Paris Radio Show/Mediadays Solutions.",
  ],
  closing: 'Cordialement,',
  signature: {
    name: 'Philippe Chapot',
    title: 'Directeur du Paris Radio Show',
    phone: '05 55 18 03 61',
  },
};

const TEXTS_EN = {
  header: (date: string) => `BRIVE, ${date}`,
  attention: 'For the attention of:',
  labels: {
    company: 'Company name:',
    address: 'Full company address:',
    postal_code: 'Postal code:',
    city: 'City:',
    country: 'Country:',
    nationality: 'Nationality:',
    birth_date: 'Date of birth:',
    profession: 'Profession:',
    passport_number: 'Passport No.:',
    passport_issue: 'Passport issue date:',
    passport_expiry: 'Passport expiry date:',
  },
  title: 'OFFICIAL INVITATION',
  greeting: 'Dear Sir or Madam,',
  paragraphs: [
    'We hereby officially invite you to attend the Paris Radio Show / Mediadays Solutions, which will be held on Tuesday, 15 December 2026, starting at 10:00 AM at the Carrousel du Louvre, 99 Rue de Rivoli, 75001 Paris, France.',
    'This trade show offers professional visitors round tables and masterclasses covering all aspects of the media, radio and digital audio industries — including technical, broadcasting, strategy, AI, podcast and monetization topics. You will be able to meet equipment manufacturers, sound design companies, programming consultants, monetization and podcast industry leaders, service providers, broadcasting operators, software publishers, and providers of any products or services in the wider media, radio, podcast, broadcasting and production sectors.',
    'We would be delighted to welcome you to our trade show. Please note that this trade show is free of charge for professionals (excluding suppliers) and will end on Tuesday, 15 December 2026 at 7:00 PM.',
    'We would also like to clarify that travel, accommodation and all related expenses are at your own cost. Paris Radio Show / Mediadays Solutions has no budget allocated to financing the attendance of professionals or speakers. In addition to this official invitation, please submit your badge request on the official Mediadays website: https://www.mediadays.net.',
    'Looking forward to meeting you at the Paris Radio Show / Mediadays Solutions.',
  ],
  closing: 'Yours sincerely,',
  signature: {
    name: 'Philippe Chapot',
    title: 'Director of the Paris Radio Show',
    phone: '+33 5 55 18 03 61',
  },
};

export function InvitationLetterDocument({
  locale,
  generatedDate,
  recipient,
}: InvitationLetterProps) {
  const t = locale === 'fr' ? TEXTS_FR : TEXTS_EN;
  const birth = recipient.birth_place
    ? `${recipient.birth_date} (${recipient.birth_place})`
    : recipient.birth_date;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{t.header(generatedDate)}</Text>

        <View style={styles.recipientBlock}>
          <Text style={styles.attention}>{t.attention}</Text>
          <Text style={styles.recipientLine}>
            {t.labels.company} {recipient.company_name}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.address} {recipient.company_full_address}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.postal_code} {recipient.postal_code}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.city} {recipient.city}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.country} {recipient.country}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.nationality} {recipient.nationality}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.birth_date} {birth}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.profession} {recipient.profession}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.passport_number} {recipient.passport_number}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.passport_issue} {recipient.passport_issue_date}
          </Text>
          <Text style={styles.recipientLine}>
            {t.labels.passport_expiry} {recipient.passport_expiry}
          </Text>
        </View>

        <Text style={styles.title}>{t.title}</Text>

        <Text style={styles.paragraph}>{t.greeting}</Text>
        {t.paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}

        <Text style={styles.paragraph}>{t.closing}</Text>

        <View style={styles.signature}>
          <Text style={styles.signatureName}>{t.signature.name}</Text>
          <Text>{t.signature.title}</Text>
          <Text>{t.signature.phone}</Text>
        </View>
      </Page>
    </Document>
  );
}

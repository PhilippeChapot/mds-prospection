import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: "Merci — Réunion d'information Paris Radio Show",
  description: "Confirmation de participation à la réunion d'information Paris Radio Show 2026.",
  robots: { index: false, follow: false },
};

const MEET_URL = 'https://meet.google.com/nqg-dvzz-cig';
const PHONE_FR = '+33 1 87 40 40 59';
const PHONE_CODE = '528 611 990#';
const MORE_PHONES_URL = 'https://tel.meet/nqg-dvzz-cig?pin=3476558180108';

// Lien Google Calendar pré-rempli — 20 mai 2026, 9h-10h Europe/Paris (UTC+2)
const GCAL_URL =
  'https://www.google.com/calendar/render?action=TEMPLATE' +
  '&text=R%C3%A9union+d%27information+-+Paris+Radio+Show' +
  '&dates=20260520T070000Z/20260520T080000Z' +
  '&details=Lien+Google+Meet%3A+https%3A%2F%2Fmeet.google.com%2Fnqg-dvzz-cig%0A' +
  'T%C3%A9l%C3%A9phone+%28FR%29%3A+%2B33+1+87+40+40+59%0A' +
  'Code%3A+528+611+990%23' +
  '&location=Google+Meet' +
  '&ctz=Europe%2FParis';

export default function MerciOuiPage() {
  return (
    <main className={styles.page} role="main">
      <article className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4 12 10 18 20 6" />
          </svg>
        </div>

        <h1 className={styles.title}>C&rsquo;est noté, on vous attend&nbsp;!</h1>

        <p className={styles.lead}>
          Merci d&rsquo;avoir confirmé votre participation à la{' '}
          <strong>réunion d&rsquo;information Paris Radio Show</strong>. Voici les informations
          pratiques&nbsp;:
        </p>

        <section className={styles.meeting} aria-labelledby="meeting-title">
          <p id="meeting-title" className={styles.meetingTitle}>
            Réunion d&rsquo;information
          </p>
          <p className={styles.meetingDate}>
            <strong>Mercredi 20 mai 2026</strong>
            <span className={styles.meetingTime}>09:00 — 10:00 (Europe/Paris)</span>
          </p>

          <div className={styles.meetingActions}>
            <a
              className={styles.meetButton}
              href={MEET_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              Rejoindre via Google Meet
            </a>
            <a
              className={styles.calendarLink}
              href={GCAL_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ajouter à mon agenda
            </a>
          </div>

          <details className={styles.phoneDetails}>
            <summary className={styles.phoneSummary}>Connexion par téléphone</summary>
            <div className={styles.phoneBlock}>
              <p className={styles.phoneRow}>
                <span className={styles.phoneLabel}>Numéro (FR)</span>
                <a className={styles.phoneValue} href={`tel:${PHONE_FR.replace(/\s/g, '')}`}>
                  {PHONE_FR}
                </a>
              </p>
              <p className={styles.phoneRow}>
                <span className={styles.phoneLabel}>Code</span>
                <span className={styles.phoneValue}>{PHONE_CODE}</span>
              </p>
              <a
                className={styles.morePhones}
                href={MORE_PHONES_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Plus de numéros de téléphone
              </a>
            </div>
          </details>
        </section>

        <section className={styles.dates} aria-labelledby="dates-title">
          <p id="dates-title" className={styles.datesTitle}>
            À noter aussi pour la fin d&rsquo;année
          </p>
          <div className={styles.dateRow}>
            <span className={styles.dateCity}>MediaDays Marseille</span>
            <span className={styles.dateWhen}>Jeudi 10 décembre 2026</span>
          </div>
          <div className={styles.dateRow}>
            <span className={styles.dateCity}>Paris Radio Show</span>
            <span className={styles.dateWhen}>Mardi 15 décembre 2026</span>
          </div>
        </section>

        <footer className={styles.footer}>
          <span className={styles.wordmark}>
            mediada<span className={styles.wordmarkY}>y</span>s solutions{' '}
            <span className={styles.year}>2026</span>
          </span>
          <span>
            Une question&nbsp;?{' '}
            <a className={styles.link} href="mailto:contact@mediadays.solutions">
              contact@mediadays.solutions
            </a>
          </span>
        </footer>
      </article>
    </main>
  );
}

import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Réponse enregistrée — MediaDays Solutions 2026',
  description: 'Votre réponse a bien été prise en compte.',
  robots: { index: false, follow: false },
};

export default function MerciNonPage() {
  return (
    <main className={styles.page} role="main">
      <article className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>

        <h1 className={styles.title}>Réponse enregistrée</h1>

        <p className={styles.lead}>
          Merci de nous avoir prévenus. Dommage de ne pas vous compter parmi nous cette année, mais
          on garde le contact pour la prochaine édition.
        </p>

        <section className={styles.note}>
          <p>
            <strong>On ne vous oublie pas.</strong> Vous resterez informé des prochains événements{' '}
            <strong>MediaDays Solutions</strong> et des actualités du secteur audio, radio et
            podcast.
          </p>
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

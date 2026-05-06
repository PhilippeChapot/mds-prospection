import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Merci — MediaDays Solutions 2026',
  description: 'Confirmation de présence aux MediaDays Solutions 2026.',
  robots: { index: false, follow: false },
};

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
          Merci d&rsquo;avoir confirmé votre présence aux <strong>MediaDays Solutions 2026</strong>.
          Vous recevrez un rappel avec toutes les informations pratiques quelques jours avant
          l&rsquo;événement.
        </p>

        <section className={styles.dates} aria-labelledby="dates-title">
          <p id="dates-title" className={styles.datesTitle}>
            À noter dans votre agenda
          </p>
          <div className={styles.dateRow}>
            <span className={styles.dateCity}>Marseille</span>
            <span className={styles.dateWhen}>Jeudi 10 décembre 2026</span>
          </div>
          <div className={styles.dateRow}>
            <span className={styles.dateCity}>Paris</span>
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

import { Link } from 'react-router-dom'
import SiteFooter from './SiteFooter.jsx'

const updated = 'September 29, 2026'

const content = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'VeriRag runs as a stateless, zero-storage document Q&A workspace. This policy explains how information is processed in memory and in your browser.',
    sections: [
      {
        title: 'No account or server database storage',
        body: ['VeriRag does not require registration, sign-in, passwords, or user accounts, and does not write uploaded PDFs, DOCX, TXT files, or URL contents to a server database or filesystem.'],
      },
      {
        title: 'In-memory processing',
        body: ['When you upload a document or submit a URL, the server extracts and chunks the text strictly in memory during that request and returns the parsed chunks to your browser session.'],
      },
      {
        title: 'Models and service providers',
        body: ['Your questions and relevant source excerpts are sent to the configured Google Gemini API to generate embeddings and cited answers under the provider’s terms and privacy commitments.'],
      },
      {
        title: 'Google Drive integration preview',
        body: ['Google Drive Sync appears in the Data Center interface as an integration option preview only; no Drive OAuth tokens or cloud files are accessed or stored.'],
      },
      {
        title: 'Local browser storage',
        body: ['Chat threads, preferences, and active session sources are stored locally in your browser (localStorage / sessionStorage) and can be cleared anytime from Settings or browser controls.'],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: 'These terms describe the rules for using VeriRag’s stateless document-grounded answer workspace.',
    sections: [
      {
        title: 'Using VeriRag',
        body: ['You may use VeriRag only in accordance with applicable law. Ensure you have permission for every document or URL you submit during your session.'],
      },
      {
        title: 'Your content',
        body: ['You retain full ownership of your source material and questions. Because VeriRag does not persist files on the server, session sources remain under your local browser control.'],
      },
      {
        title: 'Generated answers',
        body: ['VeriRag retrieves source passages and uses configured language models to generate responses with citations. Answers may still be incomplete or incorrect—verify cited sources before relying on them for consequential decisions.'],
      },
      {
        title: 'Acceptable use',
        body: ['Do not abuse public endpoints, submit malicious URLs targeting internal networks, disrupt service availability, or violate another person’s rights.'],
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    intro: 'VeriRag requires no authentication cookies and keeps only essential workspace state in local browser storage.',
    sections: [
      {
        title: 'No authentication cookies',
        body: ['Because VeriRag removes user accounts and sign-in, no session login cookies or third-party OAuth tracking cookies are set.'],
      },
      {
        title: 'Browser storage',
        body: ['The interface stores non-sensitive UI preferences (streaming, language, top-K), local conversation history in localStorage, and active document chunks in sessionStorage so your browser session works seamlessly.'],
      },
      {
        title: 'Your choices',
        body: ['You can clear conversation history from Settings or wipe localStorage and sessionStorage via browser developer/privacy controls at any time.'],
      },
    ],
  },
}

export default function LegalPage({ kind }) {
  const page = content[kind] || content.privacy

  return (
    <div className="legal-page">
      <article className="legal-article">
        <header className="legal-hero">
          <p className="legal-kicker">VeriRag legal</p>
          <h1>{page.title}</h1>
          <p className="legal-meta">Last updated {updated} · Starter policy for deployment review</p>
          <p className="legal-intro">{page.intro}</p>
        </header>

        <div className="legal-sections">
          {page.sections.map((section, index) => (
            <section key={section.title}>
              <h2>{index + 1}. {section.title}</h2>
              {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
        </div>

        <aside className="legal-contact">
          <div>
            <p className="legal-contact-label">Questions about this page?</p>
            <p>Contact your VeriRag workspace administrator.</p>
          </div>
          <nav aria-label="Legal policies">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/cookies">Cookies</Link>
          </nav>
        </aside>
      </article>
      <SiteFooter />
    </div>
  )
}

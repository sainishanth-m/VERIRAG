import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Menu,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import SiteFooter from './SiteFooter.jsx'

const DOC_GROUPS = [
  {
    label: 'Overview',
    items: [
      ['introduction', 'Introduction'],
      ['how-verirag-works', 'How VeriRag works'],
      ['quickstart', 'Quickstart'],
    ],
  },
  {
    label: 'Knowledge sources',
    items: [
      ['upload-documents', 'Upload documents'],
      ['add-a-website', 'Add a website'],
      ['google-drive', 'Google Drive'],
    ],
  },
  {
    label: 'Using VeriRag',
    items: [
      ['ask-questions', 'Ask questions'],
      ['sources-and-citations', 'Sources and citations'],
      ['chat-management', 'Manage chats'],
    ],
  },
  {
    label: 'Self-hosting',
    items: [
      ['local-setup', 'Local setup'],
      ['environment', 'Environment variables'],
      ['api-reference', 'API reference'],
    ],
  },
  {
    label: 'Help',
    items: [
      ['troubleshooting', 'Troubleshooting'],
      ['privacy-and-security', 'Privacy and security'],
    ],
  },
  {
    label: 'Contributing',
    items: [
      ['contributing', 'Contributing'],
      ['code-of-conduct', 'Code of Conduct'],
    ],
  },
]

const ON_THIS_PAGE = [
  ['how-verirag-works', 'How VeriRag works'],
  ['quickstart', 'Get started'],
  ['supported-content', 'Supported content'],
  ['sources-and-citations', 'Grounded answers'],
  ['self-hosting', 'Self-hosting'],
  ['contributing', 'Contributing'],
  ['code-of-conduct', 'Code of Conduct'],
  ['more-resources', 'More resources'],
]

function DocsSidebar({ query, onQueryChange, mobileOpen, onClose, searchRef }) {
  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return DOC_GROUPS
    return DOC_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter(([, title]) => title.toLowerCase().includes(normalized)),
      }))
      .filter((group) => group.items.length)
  }, [query])

  return (
    <aside
      className={`docs-sidebar ${mobileOpen ? 'is-open' : ''}`}
      data-lenis-prevent
      aria-label="Documentation navigation"
    >
      <div className="docs-sidebar-mobile-head">
        <strong>Documentation</strong>
        <button type="button" onClick={onClose} aria-label="Close documentation menu"><X size={18} /></button>
      </div>
      <label className="docs-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search the docs..."
          aria-label="Search documentation"
        />
        <kbd>⌘K</kbd>
      </label>
      <nav className="docs-nav-groups">
        {filteredGroups.map((group) => (
          <div className="docs-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(([id, title]) => (
              <a key={id} href={`#${id}`} onClick={onClose}>{title}</a>
            ))}
          </div>
        ))}
        {filteredGroups.length === 0 && <p className="docs-search-empty">No matching section.</p>}
      </nav>
      <div className="docs-product-version" aria-label="VeriRag version 1.0">
        <span>VeriRag</span>
        <strong>v1.0</strong>
      </div>
    </aside>
  )
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard?.writeText(String(children))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="docs-code-block">
      <button type="button" onClick={copy} aria-label="Copy code">
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre><code>{children}</code></pre>
    </div>
  )
}

function Step({ number, title, children }) {
  return (
    <li className="docs-step">
      <span>{number}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </li>
  )
}

function ResourceCard({ icon: Icon, title, children, to, external = false }) {
  const content = (
    <>
      <span className="docs-resource-icon"><Icon size={18} /></span>
      <span><strong>{title}</strong><small>{children}</small></span>
      {external ? <ExternalLink size={15} /> : <ChevronRight size={16} />}
    </>
  )
  return external
    ? <a className="docs-resource-card" href={to} target="_blank" rel="noopener noreferrer">{content}</a>
    : <Link className="docs-resource-card" to={to}>{content}</Link>
}

export default function DocsPage() {
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState(ON_THIS_PAGE[0][0])
  const searchRef = useRef(null)

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const nodes = ON_THIS_PAGE
      .map(([id]) => document.getElementById(id))
      .filter(Boolean)
    if (!nodes.length || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting)
      if (visible) setActiveSection(visible.target.id)
    }, { rootMargin: '-18% 0px -68% 0px' })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="docs-page">
      <div className="docs-mobile-bar">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open documentation menu">
          <Menu size={18} /> Menu
        </button>
        <span>VeriRag documentation</span>
      </div>

      {mobileOpen && <button className="docs-sidebar-scrim" type="button" onClick={() => setMobileOpen(false)} aria-label="Close documentation menu" />}
      <div className="docs-layout">
        <DocsSidebar
          query={query}
          onQueryChange={setQuery}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          searchRef={searchRef}
        />

        <article className="docs-content">
          <header id="introduction" className="docs-intro">
            <div className="docs-eyebrow"><BookOpen size={15} /> VeriRag documentation</div>
            <h1>Introduction</h1>
            <p className="docs-lead">
              VeriRag turns uploaded PDFs, DOCX, TXT files, and public web pages into an instant, zero-storage knowledge workspace. Ask a question in natural language and receive a streamed answer grounded in your active session sources.
            </p>
            <div className="docs-intro-actions">
              <Link to="/chat" className="docs-primary-action">Open workspace <ArrowRight size={15} /></Link>
              <Link to="/chat/data" className="docs-secondary-action">Upload documents <ArrowRight size={14} /></Link>
            </div>
          </header>

          <section id="how-verirag-works" className="docs-section">
            <h2>Turn scattered knowledge into grounded answers</h2>
            <p>VeriRag keeps the retrieval process visible so you can understand how an answer was produced.</p>
            <ul className="docs-feature-list">
              <li><Upload size={18} /><span><strong>Bring your sources</strong> — Upload PDF, DOCX, or TXT documents or add a public web page. Google Drive Sync is showcased as an integration option preview.</span></li>
              <li><Database size={18} /><span><strong>In-memory session indexing</strong> — Content is parsed in memory, divided into contextual chunks, and held solely inside your browser session with zero server storage.</span></li>
              <li><Search size={18} /><span><strong>Retrieve relevant evidence</strong> — Gemini dense embeddings and BM25 keyword search fuse top passages with Reciprocal Rank Fusion (RRF) and neighbor expansion.</span></li>
              <li><MessageSquare size={18} /><span><strong>Generate a cited response</strong> — Gemini writes strictly from retrieved evidence and streams the answer with clickable citations.</span></li>
            </ul>
          </section>

          <section id="quickstart" className="docs-section">
            <h2>Get started</h2>
            <p>You can start asking grounded questions immediately—no sign-in required.</p>
            <ol className="docs-steps">
              <Step number="1" title="Open the workspace">Go straight to the workspace or Data Center without creating an account.</Step>
              <Step number="2" title="Add knowledge">Upload a PDF, DOCX, or TXT document, or add a public website URL.</Step>
              <Step number="3" title="Choose your sources">Keep the sources you want queried selected in the composer Sources menu.</Step>
              <Step number="4" title="Ask a focused question">VeriRag retrieves relevant passages from your session sources and streams a cited response.</Step>
            </ol>
            <div className="docs-callout">
              <strong>Tip</strong>
              <p>Ask specific questions that match the language used in your documents. Include a company, topic, date range, or metric when it helps narrow the search.</p>
            </div>
          </section>

          <section id="supported-content" className="docs-section">
            <h2>Supported content</h2>
            <p>Each source is parsed in memory and isolated inside your browser session.</p>
            <div className="docs-source-grid">
              <div id="upload-documents" className="docs-source-card"><FileText size={20} /><strong>Document uploads</strong><p>PDF, DOCX, and UTF-8 TXT files. Upload up to 20 files per request, with a 50 MB limit per file.</p></div>
              <div id="add-a-website" className="docs-source-card"><Code2 size={20} /><strong>Web pages</strong><p>Public HTTP or HTTPS pages containing HTML or plain text. Private network addresses and credential-bearing URLs are rejected.</p></div>
              <div id="google-drive" className="docs-source-card"><Cloud size={20} /><strong>Google Drive</strong><p>Featured as a connector option preview in the Data Center UI for future cloud synchronization.</p></div>
            </div>
          </section>

          <section id="ask-questions" className="docs-section">
            <h2>Ask questions</h2>
            <p>When you send a knowledge question, the activity panel moves through understanding, embedding, retrieval, reranking, and response generation. Greetings are handled locally and do not start the retrieval pipeline.</p>
            <p>Answers stream into the chat as they are generated. Markdown headings, lists, emphasis, links, and tables are rendered as formatted content.</p>
          </section>

          <section id="sources-and-citations" className="docs-section">
            <h2>Understand sources and citations</h2>
            <p>The <strong>Used sources</strong> control appears above a grounded response. Open it to inspect the evidence VeriRag retrieved for that answer.</p>
            <ul className="docs-bullets">
              <li>Inline markers such as <strong>[1]</strong> refer to the corresponding retrieved source.</li>
              <li>The source panel shows document names and the relevant extracted passage.</li>
              <li>If the available evidence is incomplete, the answer should say so instead of inventing details.</li>
            </ul>
            <div className="docs-callout neutral">
              <strong>Verify critical information</strong>
              <p>Retrieval improves traceability, but generated answers can still be incomplete or incorrect. Open the cited source before relying on financial, legal, medical, or similarly important information.</p>
            </div>
          </section>

          <section id="chat-management" className="docs-section">
            <h2>Manage conversations</h2>
            <p>A chat is created in the sidebar after its first prompt. You can switch between conversations, rename them from the three-dot menu, or permanently delete a chat and its messages. Reloading a chat URL restores the selected thread.</p>
          </section>

          <section id="self-hosting" className="docs-section">
            <h2>Self-host &amp; deploy VeriRag</h2>
            <p>VeriRag pairs a React + Vite frontend with a lightweight stateless FastAPI backend configured for Vercel serverless deployment—no database or heavy ML runtime required.</p>

            <h3 id="local-setup">Local setup</h3>
            <CodeBlock>{`# Backend\npython -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload\n\n# Frontend\ncd frontend\nnpm install\nnpm run dev`}</CodeBlock>

            <h3 id="environment">Environment variables</h3>
            <p>Copy <code>.env.example</code> to <code>.env</code> for local development, or add them in your Vercel Project Settings. Never commit <code>.env</code>.</p>
            <CodeBlock>{`LLM_PROVIDER=google\nGOOGLE_API_KEY=...\nGOOGLE_LLM_MODEL=gemini-2.5-flash\nGOOGLE_EMBED_MODEL=gemini-embedding-001`}</CodeBlock>
          </section>

          <section id="api-reference" className="docs-section">
            <h2>API reference</h2>
            <p>All endpoints are stateless JSON and server-sent event routes mounted under <code>/api</code> (and root paths locally).</p>
            <div className="docs-endpoint-list">
              <div><code>GET</code><span>/api/health/ready</span><small>Verify LLM provider API key and stateless backend readiness</small></div>
              <div><code>POST</code><span>/api/ingest/files</span><small>Parse PDF, DOCX, or TXT uploads in memory into session chunks</small></div>
              <div><code>POST</code><span>/api/ingest/url</span><small>Fetch and chunk a public HTTP/HTTPS web page in memory</small></div>
              <div><code>POST</code><span>/api/query/stream</span><small>Hybrid retrieve across session chunks and stream a cited answer</small></div>
            </div>
          </section>

          <section id="troubleshooting" className="docs-section">
            <h2>Troubleshooting</h2>
            <div className="docs-troubleshooting">
              <details><summary>The response says there isn’t enough information to answer</summary><p>This does not mean your documents failed to load. The selected documents may not contain information that answers this question. Check that your document is listed and selected in Sources.</p></details>
              <details><summary>The model response is interrupted</summary><p>Check that <code>GOOGLE_API_KEY</code> is configured and valid in your environment variables, and verify <code>/api/health/ready</code> returns healthy.</p></details>
              <details><summary>Do uploaded PDFs stay after closing the tab?</summary><p>By design, VeriRag stores zero files on the server. Uploaded sources live only in your active browser session, while chat threads remain in browser localStorage until cleared.</p></details>
              <details><summary>What happens with Google Drive Sync?</summary><p>Google Drive Sync is displayed as a UI integration option preview. Use direct PDF, DOCX, TXT upload or public URLs for live Q&amp;A.</p></details>
            </div>
          </section>

          <section id="privacy-and-security" className="docs-section">
            <h2>Privacy and security</h2>
            <p>VeriRag does not require accounts, passwords, or persistent server databases. Uploaded documents are parsed strictly in memory during the request and returned solely to your browser session. URL ingestion blocks private and reserved network addresses (SSRF protection).</p>
          </section>

          <section id="contributing" className="docs-section">
            <h2>Contributing</h2>
            <p>Thanks for helping improve VeriRag. Contributions to the interface, retrieval pipeline, documentation, tests, accessibility, and deployment tooling are welcome.</p>

            <h3>Choose an issue</h3>
            <ul className="docs-bullets">
              <li>Search existing issues before opening a new one.</li>
              <li>For bugs, include reproduction steps, expected behavior, actual behavior, logs with secrets removed, and your operating system and browser.</li>
              <li>For a feature request, explain the user problem and desired outcome before proposing an implementation.</li>
            </ul>

            <h3>Prepare your branch</h3>
            <p>Update your local <code>main</code> branch and create a short branch name that describes one focused change.</p>
            <CodeBlock>{`git checkout main\ngit pull origin main\ngit checkout -b feat/short-description`}</CodeBlock>

            <h3>Run VeriRag locally</h3>
            <p>Install both workspaces and copy <code>.env.example</code> to an ignored local <code>.env</code>. Use placeholder or personal development credentials and never add secrets to a commit.</p>
            <CodeBlock>{`# Backend\npython backend/main.py\n\n# Frontend (in another terminal)\ncd frontend\nnpm install\nnpm run dev`}</CodeBlock>

            <h3>Validate your changes</h3>
            <p>Add focused tests when behavior changes, then run the verification suite.</p>
            <CodeBlock>{`# From the repository root\npytest -q\n\n# From frontend/\nnpm test -- --run\nnpm run build`}</CodeBlock>

            <h3>Submit a pull request</h3>
            <ol className="docs-contribution-list">
              <li>Keep the pull request limited to one logical change.</li>
              <li>Explain the problem, the resulting behavior, and any important implementation decision.</li>
              <li>Include screenshots or a short recording for visible interface changes.</li>
              <li>List the tests you ran and link the related issue when one exists.</li>
              <li>Confirm that generated data, uploaded documents, databases, and credentials are absent from the diff.</li>
            </ol>

            <h3>License</h3>
            <p>VeriRag is distributed under the Apache License 2.0.</p>
          </section>

          <section id="code-of-conduct" className="docs-section">
            <h2>Code of Conduct</h2>
            <p>VeriRag should be a respectful place to learn, build, review code, and exchange ideas. Everyone participating in the project is expected to follow these standards.</p>

            <h3>Expected behavior</h3>
            <ul className="docs-bullets">
              <li>Be considerate, patient, and specific when giving feedback.</li>
              <li>Discuss ideas and code without attacking the person who proposed them.</li>
              <li>Respect different backgrounds, experience levels, identities, and communication styles.</li>
              <li>Accept correction, acknowledge mistakes, and help repair their impact.</li>
              <li>Protect private information found in bug reports, logs, documents, and security reports.</li>
            </ul>

            <h3>Unacceptable behavior</h3>
            <ul className="docs-bullets">
              <li>Harassment, discrimination, threats, intimidation, or unwanted sexual attention.</li>
              <li>Personal insults, inflammatory comments, sustained disruption, or deliberate humiliation.</li>
              <li>Publishing another person’s private information without explicit permission.</li>
              <li>Using project spaces to promote spam, scams, malware, or unrelated commercial material.</li>
            </ul>

            <h3>Reporting and enforcement</h3>
            <p>Report conduct concerns privately to the project maintainers. Do not publish sensitive evidence in a public issue. Maintainers may edit or remove contributions, lock discussions, issue warnings, or temporarily or permanently restrict participation when these standards are violated.</p>
            <div className="docs-callout neutral">
              <strong>Security vulnerabilities</strong>
              <p>Do not open a public issue containing an API key, user document, access token, exploitable vulnerability, or reproduction data belonging to another person.</p>
            </div>
          </section>

          <section id="more-resources" className="docs-section docs-resources">
            <h2>More resources</h2>
            <div className="docs-resource-grid">
              <ResourceCard icon={Settings} title="Open your workspace" to="/chat">Start a conversation and manage sources.</ResourceCard>
              <ResourceCard icon={ShieldCheck} title="Privacy policy" to="/privacy">See how account and document data is handled.</ResourceCard>
              <ResourceCard icon={Code2} title="Data Center" to="/chat/data">Upload documents, add URLs, or manage indexed sources.</ResourceCard>
            </div>
          </section>

          <Link className="docs-next-link" to="/chat">
            <span><small>Next</small><strong>Open your VeriRag workspace</strong></span>
            <ArrowRight size={18} />
          </Link>
        </article>

        <aside className="docs-outline" data-lenis-prevent aria-label="On this page">
          <p>On this page</p>
          {ON_THIS_PAGE.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={activeSection === id ? 'active' : ''}>{label}</a>
          ))}
        </aside>
      </div>
      <SiteFooter />
    </div>
  )
}

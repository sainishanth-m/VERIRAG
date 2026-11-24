import React, { useEffect } from 'react'
import { Info, X, ShieldCheck, Database, Cpu, Layers } from 'lucide-react'

export default function AboutModal({ isOpen, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="app-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="app-modal-card" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <header className="app-modal-header">
          <h3><Info size={20} /> About VeriRag</h3>
          <button className="app-modal-close-btn" type="button" onClick={onClose} aria-label="Close about">
            <X size={18} />
          </button>
        </header>

        <div className="app-modal-body">
          <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#a3a3a3', margin: 0 }}>
            <strong>VeriRag</strong> is a stateless Retrieval-Augmented Generation (RAG) platform designed to parse, search, and answer questions across uploaded PDFs, DOCX, TXT files, and URLs with verifiable citations.
          </p>

          <section className="settings-section">
            <span className="settings-section-title">Core Technology Stack</span>
            <div className="settings-row">
              <div className="settings-label">
                <strong><Layers size={16} style={{ display: 'inline', marginRight: '6px' }} /> Hybrid Retrieval Engine</strong>
                <span>Combines Gemini Dense Vector Search (gemini-embedding-001) + Sparse BM25 Keyword Search using Reciprocal Rank Fusion (RRF).</span>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <strong><Cpu size={16} style={{ display: 'inline', marginRight: '6px' }} /> Parent-Context Expansion</strong>
                <span>Expands top-ranked passages cleanly to adjacent context windows before generating cited answers with Gemini Flash.</span>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <strong><Database size={16} style={{ display: 'inline', marginRight: '6px' }} /> Stateless Ephemeral Processing</strong>
                <span>Documents are parsed in memory on upload and kept only in your browser session—zero server databases or PDF storage.</span>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <strong><ShieldCheck size={16} style={{ display: 'inline', marginRight: '6px' }} /> Zero-Account Workspace</strong>
                <span>No sign-in required. Conversations remain local to your browser and can be cleared anytime.</span>
              </div>
            </div>
          </section>

          <div style={{ padding: '0.75rem 1rem', background: '#212121', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', fontSize: '0.82rem', color: '#a3a3a3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>VeriRag v1.0</span>
            <span style={{ fontWeight: 600, color: '#ececec' }}>Verified Document Q&amp;A Workspace</span>
          </div>
        </div>

        <footer className="app-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="feedback-send-btn"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}

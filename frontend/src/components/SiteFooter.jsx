import { Link } from 'react-router-dom'
import brandLogoDark from '../assets/figma-logo-mark-dark.svg'
import AskAI from './AskAI.jsx'

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="footer-logo-link">
            <img src={brandLogoDark} alt="" className="footer-logo-img" />
            <span>VeriRag</span>
          </Link>
          <p className="footer-copyright">© VeriRag 2026. All rights reserved.</p>
          <AskAI />
        </div>

        <div className="footer-links">
          <div className="footer-col">
            <h4>Product</h4>
            <Link to="/#capabilities">Features</Link>
            <Link to="/chat">Chat Workspace</Link>
            <Link to="/chat/data">Data Center</Link>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <Link to="/docs">Documentation</Link>
            <Link to="/#how-it-works">How it works</Link>
            <Link to="/#faq">FAQ</Link>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/cookies">Cookie Policy</Link>
          </div>
        </div>
      </div>
      <div className="footer-watermark" aria-hidden="true">VeriRag</div>
    </footer>
  )
}

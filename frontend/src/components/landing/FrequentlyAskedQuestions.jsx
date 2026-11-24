import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export const defaultFAQs = [
  {
    question: "What data sources can I connect to VeriRag?",
    answer:
      "You can upload PDF, DOCX, and TXT files or add an HTTP/HTTPS web page directly in your browser session. Google Drive sync is showcased as an integration preview option in the Data Center.",
  },
  {
    question: "How does VeriRag cite sources and reduce unsupported answers?",
    answer:
      "VeriRag asks the model to answer from top-ranked document passages and returns the retrieved source excerpts with the response. Citation buttons let you inspect that evidence, but you should still verify important claims against the original document.",
  },
  {
    question: "What is hybrid search and why does it outperform pure vector search?",
    answer:
      "Dense vector embeddings excel at broad conceptual semantics but often miss exact technical terms, product IDs, or financial figures. VeriRag pairs Gemini dense vector retrieval with BM25 sparse lexical search and fuses them using Reciprocal Rank Fusion (RRF) plus parent-context expansion.",
  },
  {
    question: "Is chat memory and document data stored on the server?",
    answer:
      "No. VeriRag runs completely statelessly with no user accounts or server-side database. Uploaded documents are parsed in memory and held only in your active browser session, and chat threads stay in your browser storage.",
  },
  {
    question: "Where is data processed when asking questions?",
    answer:
      "Uploaded documents are processed in memory and queried via Google Gemini embeddings and answer generation over HTTPS. Nothing is written to a persistent server filesystem or database.",
  },
  {
    question: "How does VeriRag handle document structure?",
    answer:
      "VeriRag extracts text from PDF, DOCX, and TXT documents and preserves page metadata where the parser provides it. Scanned PDFs need OCR before upload, and spreadsheet ingestion is not currently supported.",
  },
  {
    question: "How do you benchmark and evaluate retrieval quality?",
    answer:
      "VeriRag includes a RAGAS evaluation script for Faithfulness, Answer Relevancy, and Context Precision against a domain test dataset.",
  },
];

export default function FrequentlyAskedQuestions({
  badge = "FAQ",
  title = "Common questions, clear answers.",
  description = "Everything you need to know about retrieval precision, data privacy, and architecture.",
  data = defaultFAQs,
  className = "",
  supportEmail = "",
}) {
  return (
    <section
      id="faq"
      className={`faq-root-section ${className}`.trim()}
      data-nav-theme="light"
      aria-label="Frequently Asked Questions"
    >
      <div className="faq-container">
        <div className="faq-grid">
          
          {/* Left Column: Badge, Headline & Subtitle */}
          <div className="faq-left-col">
            {badge && <div className="faq-badge">{badge}</div>}

            <h2 className="faq-headline">
              {title === "Common questions, clear answers." ? (
                <>
                  Common questions,<br />clear answers.
                </>
              ) : (
                title
              )}
            </h2>

            <p className="faq-desc">
              {description}
              {supportEmail && (
                <>
                  <br />
                  <a
                    href={`mailto:${supportEmail}`}
                    className="faq-email-link"
                  >
                    {supportEmail}
                  </a>
                </>
              )}
            </p>
          </div>

          {/* Right Column: Accordion list */}
          <div className="faq-right-col">
            <Accordion type="single" collapsible defaultValue="item-0">
              {data.map((item, index) => (
                <AccordionItem key={`faq-${index}`} value={`item-${index}`}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

        </div>
      </div>
    </section>
  );
}


import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Crown,
  Layers3,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import BrandLogo from "./BrandLogo";

import "./PricingFooter.css";

const plans = [
  {
    name: "Starter",
    description: "For creators starting with multi-page publishing.",
    monthly: 499,
    yearly: 399,
    icon: Rocket,
    features: [
      "Up to 3 Facebook Pages",
      "Manual Multi-Page Scheduler",
      "Publishing calendar",
      "Basic post status tracking"
    ]
  },
  {
    name: "Professional",
    description: "For growing teams that need smarter automation.",
    monthly: 999,
    yearly: 799,
    icon: Zap,
    popular: true,
    features: [
      "Up to 10 Facebook Pages",
      "Everything in Starter",
      "Standard Auto Campaign",
      "AI content variations",
      "Campaign progress dashboard"
    ]
  },
  {
    name: "Business",
    description: "For businesses managing advanced campaigns.",
    monthly: 1999,
    yearly: 1599,
    icon: Crown,
    features: [
      "Up to 25 Facebook Pages",
      "Everything in Professional",
      "Advanced Auto Campaign",
      "Related link discovery",
      "Advanced campaign controls"
    ]
  }
];

const faqs = [
  {
    question: "What is PageCrew?",
    answer:
      "PageCrew is a planned social media management platform focused on managing multiple Facebook Pages, scheduling posts and organizing automated content campaigns."
  },
  {
    question: "Can I manage multiple Facebook Pages?",
    answer:
      "Multi-page management is a core planned feature. Live connectivity will require Facebook authorization and the appropriate Meta API permissions."
  },
  {
    question: "What is the difference between the three tools?",
    answer:
      "Manual Scheduler lets you prepare and schedule posts. Standard Auto Campaign focuses on AI-generated content variations. Advanced Auto Campaign adds workflows such as related link discovery."
  },
  {
    question: "Does PageCrew publish posts automatically?",
    answer:
      "Automated publishing is a planned backend feature. The current website is a frontend demonstration and does not publish real Facebook posts."
  },
  {
    question: "Are these subscription prices final?",
    answer:
      "No. The displayed plans and prices are illustrative and can be changed before launch."
  },
  {
    question: "Can I pause or stop campaigns?",
    answer:
      "The current demo includes interactive Pause, Resume and Stop controls. Real campaign controls will require backend integration."
  }
];

export default function PricingFooter() {
  const [billing, setBilling] = useState("monthly");
  const [openFaq, setOpenFaq] = useState(0);
  const reduceMotion = useReducedMotion();

  return (
    <>
      <section className="pf-pricing-section" id="pricing">
        <div className="pf-container">

          <motion.div
            className="pf-heading"
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="pf-eyebrow">
              ✦ SIMPLE & FLEXIBLE PLANS
            </span>

            <h2>
              Powerful Tools.
              <br />
              <span>Flexible Pricing.</span>
            </h2>

            <p>
              Explore sample plans designed for creators,
              marketers and growing businesses.
            </p>
          </motion.div>

          <div className="pf-billing-toggle">
            <button
              type="button"
              className={billing === "monthly" ? "active" : ""}
              onClick={() => setBilling("monthly")}
              aria-pressed={billing === "monthly"}
            >
              Monthly
            </button>

            <button
              type="button"
              className={billing === "yearly" ? "active" : ""}
              onClick={() => setBilling("yearly")}
              aria-pressed={billing === "yearly"}
            >
              Yearly
              <span>Save 20%</span>
            </button>
          </div>

          <div className="pf-pricing-grid">
            {plans.map((plan, index) => {
              const Icon = plan.icon;
              const price =
                billing === "monthly"
                  ? plan.monthly
                  : plan.yearly;

              return (
                <motion.article
                  key={plan.name}
                  className={`pf-plan-card ${
                    plan.popular ? "pf-popular" : ""
                  }`}
                  initial={
                    reduceMotion
                      ? false
                      : { opacity: 0, y: 40 }
                  }
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.6,
                    delay: index * 0.1
                  }}
                >
                  {plan.popular && (
                    <div className="pf-popular-label">
                      <Sparkles size={14} />
                      MOST POPULAR
                    </div>
                  )}

                  <div className="pf-plan-icon">
                    <Icon size={26} />
                  </div>

                  <h3>{plan.name}</h3>
                  <p className="pf-plan-description">
                    {plan.description}
                  </p>

                  <div className="pf-price">
                    <strong>₹{price.toLocaleString("en-IN")}</strong>
                    <span>/month</span>
                  </div>

                  <p className="pf-billing-note">
                    {billing === "yearly"
                      ? `₹${(price * 12).toLocaleString("en-IN")} billed yearly`
                      : "Billed monthly"}
                  </p>

                  <a
                    href="#get-started"
                    className="pf-plan-button"
                  >
                    Explore Plan
                    <ArrowRight size={17} />
                  </a>

                  <div className="pf-feature-divider" />

                  <h4>What's included</h4>

                  <div className="pf-feature-list">
                    {plan.features.map((feature) => (
                      <div key={feature}>
                        <Check size={16} />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </motion.article>
              );
            })}
          </div>

          <p className="pf-pricing-note">
            Illustrative plans only. No checkout or subscription
            purchase is available in this frontend demo.
          </p>
        </div>
      </section>

      <section className="pf-faq-section" id="faq">
        <div className="pf-container">
          <div className="pf-heading">
            <span className="pf-eyebrow">
              ✦ FREQUENTLY ASKED QUESTIONS
            </span>

            <h2>
              Have Questions?
              <br />
              <span>We've Got Answers.</span>
            </h2>

            <p>
              Learn more about the planned PageCrew platform.
            </p>
          </div>

          <div className="pf-faq-list">
            {faqs.map((faq, index) => (
              <div
                className={`pf-faq-item ${
                  openFaq === index ? "open" : ""
                }`}
                key={faq.question}
              >
                <button
                  type="button"
                  className="pf-faq-question"
                  onClick={() =>
                    setOpenFaq(
                      openFaq === index ? null : index
                    )
                  }
                  aria-expanded={openFaq === index}
                >
                  <span>{faq.question}</span>
                  <ChevronDown size={20} />
                </button>

                {openFaq === index && (
                  <div className="pf-faq-answer">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-cta-section" id="get-started">
        <div className="pf-container">
          <motion.div
            className="pf-cta-box"
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="pf-cta-glow" />

            <div className="pf-cta-icon">
              <Layers3 size={30} />
            </div>

            <span className="pf-eyebrow">
              THE FUTURE OF MULTI-PAGE PUBLISHING
            </span>

            <h2>
              Ready to Simplify
              <br />
              Your Publishing Workflow?
            </h2>

            <p>
              Explore PageCrew's publishing tools, campaign
              automation concepts and smart scheduling experience.
            </p>

            <a href="#tools" className="pf-cta-button">
              Explore PageCrew
              <ArrowRight size={19} />
            </a>

            <div className="pf-cta-trust">
              <span><ShieldCheck size={15} /> Multi-Page Management</span>
              <span><Sparkles size={15} /> AI Automation</span>
              <span><Zap size={15} /> Smart Scheduling</span>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="pf-footer" id="contact">
        <div className="pf-container">
          <div className="pf-footer-grid">

            <div className="pf-footer-brand">
              <a href="#home" className="pf-footer-logo">
                <BrandLogo className="pf-footer-logo-image" />
                PageCrew
              </a>

              <p>
                A smarter workspace for managing multiple
                Facebook Pages, planning content and organizing
                automated publishing campaigns.
              </p>

              <span className="pf-footer-demo">
                Frontend Prototype
              </span>
            </div>

            <div className="pf-footer-column">
              <h4>Platform</h4>
              <a href="#tools">Our Tools</a>
              <a href="#features">Features</a>
              <a href="#scheduling">Scheduling</a>
              <a href="#analytics">Analytics</a>
            </div>

            <div className="pf-footer-column">
              <h4>Explore</h4>
              <a href="#how-it-works">How It Works</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQs</a>
              <a href="#home">Back to Top</a>
            </div>

            <div className="pf-footer-column">
              <h4>Contact</h4>
              <p>
                Have questions about the PageCrew project?
              </p>

              <span className="pf-contact-label">
                <Mail size={17} />
                Contact details coming soon
              </span>
            </div>

          </div>

          <div className="pf-footer-bottom">
            <span>
              © {new Date().getFullYear()} PageCrew.
              All rights reserved.
            </span>

            <span>
              Designed for smarter publishing.
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}

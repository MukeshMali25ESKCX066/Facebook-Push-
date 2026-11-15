
import { motion, useReducedMotion } from "framer-motion";
import {
  Link2,
  Layers3,
  CalendarClock,
  Send,
  ArrowRight,
  CheckCircle2
} from "lucide-react";

import "./HowItWorks.css";

const steps = [
  {
    number: "01",
    title: "Connect Facebook Pages",
    description:
      "Securely connect and authorize your Facebook Pages to manage them from one workspace.",
    icon: Link2,
    tag: "CONNECT"
  },
  {
    number: "02",
    title: "Choose Your Tool",
    description:
      "Select Manual Scheduler, Standard Auto Campaign or Advanced Auto Campaign based on your workflow.",
    icon: Layers3,
    tag: "SELECT"
  },
  {
    number: "03",
    title: "Create & Schedule",
    description:
      "Prepare your content, choose Facebook Pages and configure publishing dates or campaign intervals.",
    icon: CalendarClock,
    tag: "SCHEDULE"
  },
  {
    number: "04",
    title: "Publish & Track",
    description:
      "Monitor scheduled publishing, campaign progress and individual post statuses from one dashboard.",
    icon: Send,
    tag: "MONITOR"
  }
];

export default function HowItWorks() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="how-section" id="how-it-works">
      <div className="how-container">

        <motion.div
          className="how-heading"
          initial={reduceMotion ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <span className="how-eyebrow">
            ✦ SIMPLE & POWERFUL WORKFLOW
          </span>

          <h2>
            From Idea to Published.
            <br />
            <span>In Four Simple Steps.</span>
          </h2>

          <p>
            Connect your pages, choose the right publishing
            tool and let PageCrew organize your content workflow.
          </p>
        </motion.div>

        <div className="how-steps">
          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <motion.div
                className="how-step"
                key={step.number}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: 45 }
                }
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{
                  duration: 0.6,
                  delay: index * 0.12
                }}
              >
                <div className="how-card">
                  <div className="how-card-top">
                    <span className="how-number">
                      {step.number}
                    </span>
                    <span className="how-tag">
                      {step.tag}
                    </span>
                  </div>

                  <motion.div
                    className="how-icon-box"
                    whileHover={
                      reduceMotion ? {} : {
                        rotateY: 15,
                        rotateX: -10,
                        scale: 1.08
                      }
                    }
                    transition={{ duration: 0.3 }}
                  >
                    <Icon size={32} strokeWidth={1.7} />
                  </motion.div>

                  <h3>{step.title}</h3>
                  <p>{step.description}</p>

                  <div className="how-card-bottom">
                    <CheckCircle2 size={16} />
                    <span>Step {index + 1} of 4</span>
                  </div>
                </div>

                {index < steps.length - 1 && (
                  <div
                    className="how-connector"
                    aria-hidden="true"
                  >
                    <ArrowRight size={19} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="how-bottom"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="how-bottom-icon">
            <Send size={23} />
          </div>

          <div>
            <strong>
              One workspace. A smarter publishing process.
            </strong>
            <p>
              Manage content, scheduling and campaign
              activity without switching between tools.
            </p>
          </div>

          <a href="#tools">
            Explore Tools <ArrowRight size={17} />
          </a>
        </motion.div>

      </div>
    </section>
  );
}

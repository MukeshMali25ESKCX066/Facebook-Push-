
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  Sparkles,
  Link2,
  ArrowUpRight,
  CheckCircle2,
  Layers3,
  Clock3,
  Globe2
} from "lucide-react";

import "./ToolsSection.css";

const tools = [
  {
    number: "01",
    title: "Manual Multi-Page Scheduler",
    subtitle: "Full Control. Smart Scheduling.",
    description:
      "Create posts, select multiple Facebook Pages and schedule publishing from one powerful workspace.",
    icon: CalendarDays,
    theme: "purple",
    features: [
      "Multi-page post scheduling",
      "Content & media composer",
      "Calendar and publishing queue",
      "Post status tracking"
    ]
  },
  {
    number: "02",
    title: "Standard Auto Campaign",
    subtitle: "Create Once. Automate More.",
    description:
      "Turn event details and a website URL into unique page-specific social posts with AI-powered content generation.",
    icon: Sparkles,
    theme: "blue",
    features: [
      "AI-generated titles & captions",
      "Website and event analysis",
      "Unique content for every page",
      "Automated publishing intervals"
    ]
  },
  {
    number: "03",
    title: "Advanced Auto Campaign",
    subtitle: "Advanced AI. Smarter Reach.",
    description:
      "Start with an image, description and main URL. Discover related links and prepare unique content for every selected page.",
    icon: Link2,
    theme: "pink",
    features: [
      "Related link discovery",
      "Image-based campaigns",
      "Unique page-wise post variations",
      "Smart campaign scheduling"
    ]
  }
];

function ToolCard({ tool, index }) {
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduceMotion = useReducedMotion();
  const Icon = tool.icon;

  const handleMouseMove = (event) => {
    if (reduceMotion || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    setTilt({
      x: (0.5 - y) * 10,
      y: (x - 0.5) * 10
    });
  };

  return (
    <motion.article
      ref={cardRef}
      className={`tool-card tool-${tool.theme}`}
      initial={{ opacity: 0, y: 45 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay: index * 0.12 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        rotateX: tilt.x,
        rotateY: tilt.y
      }}
    >
      <div className="tool-card-glow" />

      <div className="tool-card-top">
        <div className="tool-icon">
          <Icon size={28} strokeWidth={1.8} />
        </div>

        <span className="tool-number">{tool.number}</span>
      </div>

      <div className="tool-visual">
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />

        <motion.div
          className="visual-center"
          animate={
            reduceMotion ? {} : { y: [0, -8, 0] }
          }
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <Icon size={38} strokeWidth={1.5} />
        </motion.div>

        <div className="visual-mini mini-one">
          <Layers3 size={16} />
        </div>

        <div className="visual-mini mini-two">
          <Clock3 size={16} />
        </div>

        <div className="visual-mini mini-three">
          <Globe2 size={16} />
        </div>
      </div>

      <div className="tool-card-content">
        <span className="tool-subtitle">{tool.subtitle}</span>

        <h3>{tool.title}</h3>

        <p>{tool.description}</p>

        <div className="tool-features">
          {tool.features.map((feature) => (
            <div className="tool-feature" key={feature}>
              <CheckCircle2 size={15} />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        <a
          href="#how-it-works"
          className="tool-learn-more"
        >
          Learn More
          <ArrowUpRight size={18} />
        </a>
      </div>
    </motion.article>
  );
}

export default function ToolsSection() {
  return (
    <section className="tools-section" id="tools">
      <div className="tools-container">

        <motion.div
          className="tools-heading"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <span className="tools-eyebrow">
            ✦ POWERFUL PUBLISHING TOOLS
          </span>

          <h2>
            Everything You Need.
            <br />
            <span>One Powerful Platform.</span>
          </h2>

          <p>
            From manual scheduling to AI-powered automation,
            PageCrew gives you three powerful ways to manage
            and publish content across multiple Facebook Pages.
          </p>
        </motion.div>

        <div className="tools-grid">
          {tools.map((tool, index) => (
            <ToolCard
              key={tool.number}
              tool={tool}
              index={index}
            />
          ))}
        </div>

      </div>
    </section>
  );
}


import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Sparkles,
  Layers3,
  ArrowRight,
  Globe2,
  CheckCircle2,
  Link2,
  Copy,
  Check,
  WandSparkles
} from "lucide-react";

import "./UniqueContent.css";

const posts = [
  {
    id: 1,
    page: "Tech Daily",
    category: "Technology",
    initial: "T",
    color: "purple",
    title: "Discover Smarter Digital Workflows",
    caption:
      "Explore new ways to simplify your digital workflow. Discover practical ideas, useful tools and smarter ways to work.",
    hashtags: ["#Technology", "#DigitalTools", "#Innovation"],
    url: "https://example.com/technology"
  },
  {
    id: 2,
    page: "Creative Studio",
    category: "Creative Community",
    initial: "C",
    color: "blue",
    title: "Create More. Manage Less.",
    caption:
      "Great ideas deserve more time. Explore creative approaches that help teams organize content and focus on meaningful work.",
    hashtags: ["#CreativeWork", "#ContentCreation", "#Ideas"],
    url: "https://example.com/creative"
  },
  {
    id: 3,
    page: "Business Hub",
    category: "Business",
    initial: "B",
    color: "pink",
    title: "Build a More Organized Content Strategy",
    caption:
      "Consistent communication starts with a clear plan. Discover how structured workflows can support your business content strategy.",
    hashtags: ["#BusinessGrowth", "#Marketing", "#Strategy"],
    url: "https://example.com/business"
  }
];

function PostCard({ post, index }) {
  const cardRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);

  const handleMouseMove = (event) => {
    if (reduceMotion || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    setTilt({
      x: (0.5 - y) * 8,
      y: (x - 0.5) * 8
    });
  };

  const copyPost = async () => {
    const content = [
      post.title,
      post.caption,
      post.hashtags.join(" "),
      post.url
    ].join("\n\n");

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.article
      ref={cardRef}
      className={`unique-post-card unique-${post.color}`}
      initial={reduceMotion ? false : { opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.65, delay: index * 0.12 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        rotateX: tilt.x,
        rotateY: tilt.y
      }}
    >
      <div className="unique-card-shine" />

      <div className="unique-post-header">
        <div className="unique-page-avatar">
          {post.initial}
        </div>

        <div className="unique-page-details">
          <strong>{post.page}</strong>
          <span>{post.category}</span>
        </div>

        <Globe2 size={19} className="unique-globe" />
      </div>

      <div className="unique-post-image">
        <div className="unique-image-glow" />

        <motion.div
          className="unique-image-symbol"
          animate={reduceMotion ? {} : { y: [0, -8, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <Sparkles size={35} />
        </motion.div>

        <span>AI CONTENT PREVIEW</span>
      </div>

      <div className="unique-post-body">
        <div className="unique-generated-label">
          <WandSparkles size={14} />
          Example AI-Style Variation
        </div>

        <h3>{post.title}</h3>
        <p>{post.caption}</p>

        <div className="unique-hashtags">
          {post.hashtags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="unique-url">
          <Link2 size={15} />
          <span>{post.url}</span>
        </div>

        <div className="unique-post-footer">
          <span>
            <CheckCircle2 size={15} />
            Sample Content
          </span>

          <button
            type="button"
            onClick={copyPost}
            aria-label={`Copy sample post for ${post.page}`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

export default function UniqueContent() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="unique-section" id="features">
      <div className="unique-container">

        <motion.div
          className="unique-heading"
          initial={reduceMotion ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <span className="unique-eyebrow">
            ✦ AI-POWERED CONTENT VARIATIONS
          </span>

          <h2>
            One Campaign. Multiple Pages.
            <br />
            <span>Unique Content for Every Audience.</span>
          </h2>

          <p>
            Create page-specific titles, captions and hashtags
            for multiple Facebook Pages from one campaign.
            Keep your message relevant to every audience.
          </p>
        </motion.div>

        <div className="unique-flow">
          <div className="unique-flow-source">
            <Layers3 size={20} />
            <span>One Campaign</span>
          </div>

          <ArrowRight size={21} className="unique-flow-arrow" />

          <div className="unique-flow-result">
            <Sparkles size={20} />
            <span>3 Unique Post Variations</span>
          </div>
        </div>

        <div className="unique-post-grid">
          {posts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              index={index}
            />
          ))}
        </div>

        <div className="unique-bottom-note">
          <Sparkles size={19} />
          <p>
            Each preview demonstrates different titles,
            captions and hashtags. These are illustrative
            examples, not live AI-generated posts.
          </p>
        </div>

      </div>
    </section>
  );
}

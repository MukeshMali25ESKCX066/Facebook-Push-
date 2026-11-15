
import { motion } from "framer-motion";
import Dashboard3D from "./Dashboard3D";

export default function Hero3D() {
  return (
    <section className="hero" id="home">

      {/* Left Side - Hero Content */}
      <div className="hero-content">
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.8,
            ease: "easeOut",
          }}
        >
          {/* Small Heading */}
          <span className="eyebrow">
            ✦ SMART SOCIAL MEDIA MANAGEMENT
          </span>

          {/* Main Heading */}
          <h1>
            One Platform.
            <br />
            Multiple Pages.
            <br />
            <span>Smarter Publishing.</span>
          </h1>

          {/* Supporting Description */}
          <p>
            Manage, schedule and automate your Facebook Pages
            with PageCrew. Create unique content, schedule
            posts across multiple pages and automate your
            campaigns from one powerful workspace.
          </p>

          {/* Action Buttons */}
          <div className="hero-buttons">
            <motion.a
              href="#get-started"
              className="primary-btn"
              whileHover={{
                scale: 1.05,
                y: -3,
              }}
              whileTap={{ scale: 0.97 }}
            >
              Get Started →
            </motion.a>

            <motion.a
              href="#features"
              className="secondary-btn"
              whileHover={{
                scale: 1.05,
                y: -3,
              }}
              whileTap={{ scale: 0.97 }}
            >
              Explore Features
            </motion.a>
          </div>

          {/* Additional Information */}
          <motion.div
            className="hero-info"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: 0.7,
              duration: 0.7,
            }}
          >
            <span>✦ Multi-Page Management</span>
            <span>✦ AI Content Generation</span>
            <span>✦ Smart Scheduling</span>
          </motion.div>
        </motion.div>
      </div>

      {/* Right Side - Animated Dashboard */}
      <motion.div
        className="hero-canvas"
        initial={{
          opacity: 0,
          x: 50,
        }}
        animate={{
          opacity: 1,
          x: 0,
        }}
        transition={{
          duration: 1,
          delay: 0.2,
        }}
      >
        <Dashboard3D />
      </motion.div>

    </section>
  );
}

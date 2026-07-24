import { motion } from "framer-motion";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div style={{
      minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 20px", textAlign: "center",
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        style={{ fontSize: 88, marginBottom: 24, lineHeight: 1 }}
      >
        🔍
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.5 }}
        style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, marginBottom: 14, color: "#e8eaf0" }}
      >
        Page Not Found
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.5 }}
        style={{ fontSize: 16, color: "#8892a4", marginBottom: 36, maxWidth: 400, lineHeight: 1.6 }}
      >
        This page doesn't exist or the link may have expired. Head back to browse apps.
      </motion.p>
      <motion.button
        className="btn-green"
        style={{ fontSize: 15, padding: "12px 32px" }}
        onClick={() => navigate("/")}
        whileHover={{ scale: 1.07, y: -2 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
      >
        Browse Apps
      </motion.button>
    </div>
  );
}

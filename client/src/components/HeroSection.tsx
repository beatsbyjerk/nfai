"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Token, displayMcap, getMultiplier, mcapChange } from "@/components/TokenCard";
import { formatMcap } from "@/lib/utils";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PARTICLE_COUNT = 160;
const STREAM_COUNT = 32;
const CONN_DIST = 85;
const CONN_DIST_SQ = CONN_DIST * CONN_DIST;
const MOUSE_RADIUS = 180;
const MOUSE_FORCE = 0.6;
const CENTER_GRAVITY = 0.014;
const DAMPING = 0.985;

const COL = {
  accent: [0, 229, 160] as const,
  blue: [0, 160, 255] as const,
  purple: [140, 80, 255] as const,
};

const SPRING_SNAPPY = { type: "spring" as const, damping: 28, stiffness: 280 };
const SPRING_SMOOTH = { type: "spring" as const, damping: 22, stiffness: 100 };
const SPRING_BOUNCY = { type: "spring" as const, damping: 14, stiffness: 200 };

const ANALYSIS_STEPS = [
  "Detecting on-chain activity",
  "Tracking volume momentum",
  "Analyzing holder patterns",
  "Computing conviction score",
];

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

interface MouseState { x: number; y: number; active: boolean; }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; opacity: number;
  color: readonly [number, number, number];
  isStream: boolean; angle: number; speed: number;
}

export interface HeroProps {
  tokens: Token[];
  hotTokens: Token[];
  allTokens: Token[];
  stats: { totalTokens?: number } | null;
  hotCount: number;
  dexCacheSize: number;
  connected: boolean;
  onTokenClick?: (token: Token) => void;
}

/* ═══════════════════════════════════════════════════════════════════
   CANVAS — Neural Particle Mesh
   ═══════════════════════════════════════════════════════════════════ */

function initParticles(w: number, h: number, pCount: number, sCount: number) {
  const particles: Particle[] = [];
  const cx = w / 2, cy = h / 2;
  const colors = [COL.accent, COL.blue, COL.purple];
  for (let i = 0; i < pCount; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 0.5, opacity: Math.random() * 0.35 + 0.1,
      color: colors[i < pCount * 0.55 ? 0 : Math.floor(Math.random() * 3)],
      isStream: false, angle: 0, speed: 0,
    });
  }
  for (let i = 0; i < sCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(w, h) * 0.55;
    particles.push({
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
      vx: 0, vy: 0, size: Math.random() * 1.4 + 0.8, opacity: 0,
      color: COL.accent, isStream: true, angle, speed: Math.random() * 1.4 + 0.9,
    });
  }
  return particles;
}

function NeuralCanvas({ mouseRef }: { mouseRef: React.RefObject<MouseState | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const stateRef = useRef<{ particles: Particle[]; w: number; h: number; time: number }>({
    particles: [], w: 0, h: 0, time: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const state = stateRef.current;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      state.w = rect.width; state.h = rect.height;
      canvas.width = state.w * dpr; canvas.height = state.h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mobile = state.w < 768;
      state.particles = initParticles(state.w, state.h, mobile ? 80 : PARTICLE_COUNT, mobile ? 14 : STREAM_COUNT);
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      const { w, h, particles } = state;
      if (w === 0) { rafRef.current = requestAnimationFrame(animate); return; }
      const cx = w / 2, cy = h / 2;
      const mouse = mouseRef.current;
      state.time++;
      ctx.clearRect(0, 0, w, h);

      const regular: Particle[] = [];
      const streams: Particle[] = [];

      for (const p of particles) {
        if (p.isStream) {
          streams.push(p);
          const dx = cx - p.x, dy = cy - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 25) {
            p.angle = Math.random() * Math.PI * 2;
            const edge = Math.max(w, h) * 0.55;
            p.x = cx + Math.cos(p.angle) * edge;
            p.y = cy + Math.sin(p.angle) * edge;
            p.opacity = 0;
          } else {
            p.x += (dx / dist) * p.speed; p.y += (dy / dist) * p.speed;
            p.opacity = Math.min(0.65, p.opacity + 0.009);
          }
        } else {
          regular.push(p);
          const dx = cx - p.x, dy = cy - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 40) { p.vx += (dx / dist) * CENTER_GRAVITY; p.vy += (dy / dist) * CENTER_GRAVITY; }
          if (mouse && mouse.active) {
            const mdx = p.x - mouse.x, mdy = p.y - mouse.y;
            const mdSq = mdx * mdx + mdy * mdy;
            if (mdSq < MOUSE_RADIUS * MOUSE_RADIUS && mdSq > 1) {
              const md = Math.sqrt(mdSq);
              const force = ((MOUSE_RADIUS - md) / MOUSE_RADIUS) * MOUSE_FORCE;
              p.vx += (mdx / md) * force; p.vy += (mdy / md) * force;
            }
          }
          p.vx *= DAMPING; p.vy *= DAMPING; p.x += p.vx; p.y += p.vy;
          if (p.x < -30) p.x = w + 30; if (p.x > w + 30) p.x = -30;
          if (p.y < -30) p.y = h + 30; if (p.y > h + 30) p.y = -30;
        }
      }

      ctx.lineWidth = 0.5;
      for (let i = 0; i < regular.length; i++) {
        for (let j = i + 1; j < regular.length; j++) {
          const dx = regular[i].x - regular[j].x, dy = regular[i].y - regular[j].y;
          const dSq = dx * dx + dy * dy;
          if (dSq < CONN_DIST_SQ) {
            const d = Math.sqrt(dSq);
            let alpha = (1 - d / CONN_DIST) * 0.14;
            if (mouse && mouse.active) {
              const mx = (regular[i].x + regular[j].x) / 2, my = (regular[i].y + regular[j].y) / 2;
              const mDist = Math.sqrt((mx - mouse.x) ** 2 + (my - mouse.y) ** 2);
              if (mDist < MOUSE_RADIUS) alpha += (1 - mDist / MOUSE_RADIUS) * 0.15;
            }
            ctx.beginPath(); ctx.moveTo(regular[i].x, regular[i].y); ctx.lineTo(regular[j].x, regular[j].y);
            ctx.strokeStyle = `rgba(${COL.accent[0]},${COL.accent[1]},${COL.accent[2]},${alpha})`;
            ctx.stroke();
          }
        }
      }

      for (const p of streams) {
        const dx = cx - p.x, dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        const trailLen = Math.min(40, p.speed * 12);
        const nx = dx / dist, ny = dy / dist;
        const t = dist / (Math.max(w, h) * 0.5);
        const r = Math.round(COL.accent[0] * t + COL.blue[0] * (1 - t));
        const g = Math.round(COL.accent[1] * t + COL.blue[1] * (1 - t));
        const b = Math.round(COL.accent[2] * t + COL.blue[2] * (1 - t));
        const grad = ctx.createLinearGradient(p.x, p.y, p.x - nx * trailLen, p.y - ny * trailLen);
        grad.addColorStop(0, `rgba(${r},${g},${b},${p.opacity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - nx * trailLen, p.y - ny * trailLen);
        ctx.strokeStyle = grad; ctx.lineWidth = p.size; ctx.stroke();
      }

      for (const p of particles) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${p.opacity})`;
        ctx.fill();
        if (p.size > 1.4) {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${p.opacity * 0.1})`;
          ctx.fill();
        }
      }

      for (let r = 0; r < 4; r++) {
        const phase = ((state.time + r * 55) % 220) / 220;
        const radius = phase * Math.min(w, h) * 0.42;
        const alpha = (1 - phase) * 0.06;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,229,160,${alpha})`; ctx.lineWidth = 1; ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [mouseRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.7 }} />;
}

/* ═══════════════════════════════════════════════════════════════════
   INTELLIGENCE CARD — Clickable, bigger, in-your-face
   ═══════════════════════════════════════════════════════════════════ */

function IntelCard({ token, stage, slotIndex, onClick }: {
  token: Token; stage: number; slotIndex: number; onClick?: () => void;
}) {
  const mcap = displayMcap(token);
  const mult = getMultiplier(token);
  const change = mcapChange(token);
  const isHot = (change != null && change > 80) || (mult != null && mult >= 3);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.75, filter: "blur(10px)" }}
      animate={{
        opacity: 1, scale: 1, filter: "blur(0px)",
        y: [0, -6, 0, 6, 0],
      }}
      exit={{ opacity: 0, scale: 0.8, filter: "blur(8px)" }}
      transition={{
        ...SPRING_SMOOTH,
        y: { duration: 5 + slotIndex * 0.8, repeat: Infinity, ease: "easeInOut" },
        filter: { duration: 0.4 },
      }}
      onClick={onClick}
      className="w-64 cursor-pointer group/card"
    >
      <div className="relative bg-background/65 backdrop-blur-2xl border border-accent/10 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,229,160,0.06),0_12px_40px_rgba(0,0,0,0.4)] group-hover/card:border-accent/25 group-hover/card:shadow-[0_0_80px_rgba(0,229,160,0.1),0_12px_40px_rgba(0,0,0,0.5)] transition-all duration-300">
        {/* Scan line */}
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent pointer-events-none z-10"
          animate={{ top: ["-2%", "105%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: slotIndex * 0.6 }}
        />

        {/* Corner brackets */}
        <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-accent/25 rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-accent/25 rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-accent/25 rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-accent/25 rounded-br-xl" />

        <div className="relative p-4 z-[2]">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            {token.image ? (
              <div className="relative shrink-0">
                <img src={token.image} alt="" className="w-10 h-10 rounded-xl ring-1 ring-accent/20 object-cover" />
                {stage >= 3 && (
                  <motion.div
                    className="absolute -inset-1.5 rounded-xl border border-accent/35"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-surface-raised ring-1 ring-border flex items-center justify-center text-sm text-muted font-bold shrink-0">
                {(token.symbol || "?")[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground/90 truncate">{token.symbol || "???"}</div>
              <div className="text-[10px] text-muted/40 truncate">{token.name || "Unknown"}</div>
            </div>
            <AnimatePresence>
              {isHot && stage >= 2 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={SPRING_BOUNCY}
                  className="text-[9px] font-black bg-accent/15 text-accent px-2 py-1 rounded-lg border border-accent/20"
                >
                  HOT
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pipeline */}
          <div className="flex gap-1 mb-3">
            {[0, 1, 2, 3].map((s) => (
              <div key={s} className="h-1 flex-1 rounded-full bg-border/30 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-bright"
                  initial={{ width: "0%" }}
                  animate={{ width: s <= stage ? "100%" : "0%" }}
                  transition={{ duration: 0.4, delay: s * 0.1, ease: "easeOut" }}
                />
              </div>
            ))}
          </div>

          {/* Analysis label */}
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              className="w-2 h-2 rounded-full bg-accent"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-[10px] font-mono text-accent/50 tracking-wide">
              {ANALYSIS_STEPS[Math.min(stage, 3)]}
            </span>
          </div>

          {/* Metrics at stage 2+ */}
          <AnimatePresence>
            {stage >= 2 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 text-xs mb-1.5">
                  <span className="text-foreground/60 font-mono font-bold">{formatMcap(mcap)}</span>
                  {mult != null && mult > 1 && (
                    <motion.span
                      className={`font-black font-mono ${mult >= 5 ? "text-yellow-400" : mult >= 3 ? "text-accent" : "text-accent/80"}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={SPRING_BOUNCY}
                    >
                      {mult.toFixed(1)}x
                    </motion.span>
                  )}
                  {change != null && (
                    <span className={`font-mono font-bold ${change >= 0 ? "text-accent/70" : "text-danger/70"}`}>
                      {change >= 0 ? "+" : ""}{change.toFixed(0)}%
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Signal lock */}
          <AnimatePresence>
            {stage >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_SNAPPY, delay: 0.1 }}
                className="flex items-center justify-between pt-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <div className="text-[9px] font-mono text-accent/60 uppercase tracking-widest">Signal Locked</div>
                  <motion.div
                    className="w-2 h-2 rounded-full bg-accent"
                    animate={{ boxShadow: ["0 0 4px rgba(0,229,160,0.3)", "0 0 14px rgba(0,229,160,0.6)", "0 0 4px rgba(0,229,160,0.3)"] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                </div>
                <span className="text-[9px] text-muted/30 group-hover/card:text-accent/40 transition-colors font-mono">TAP TO VIEW</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ORBITING TOKENS
   ═══════════════════════════════════════════════════════════════════ */

function OrbitToken({ token, index, total, onHover }: {
  token: Token; index: number; total: number;
  onHover?: (t: Token | null) => void;
}) {
  const mult = getMultiplier(token);
  const isHot = mult != null && mult >= 3;
  const radius = 130 + (index % 3) * 35;
  const duration = 24 + index * 2.5;

  return (
    <motion.div
      className="absolute top-1/2 left-1/2"
      style={{ width: 0, height: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      <motion.div
        className="absolute cursor-pointer"
        style={{ left: radius, top: -18, width: 36, height: 36 }}
        animate={{ rotate: -360 }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
        whileHover={{ scale: 1.6, zIndex: 50 }}
        onHoverStart={() => onHover?.(token)}
        onHoverEnd={() => onHover?.(null)}
      >
        {token.image ? (
          <img
            src={token.image}
            alt={token.symbol || ""}
            className={`w-9 h-9 rounded-full transition-shadow duration-300 ${
              isHot
                ? "ring-2 ring-accent/40 shadow-[0_0_20px_rgba(0,229,160,0.3)]"
                : "ring-1 ring-white/10 shadow-[0_0_10px_rgba(0,0,0,0.4)]"
            }`}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-surface-raised ring-1 ring-border/40 flex items-center justify-center text-[10px] font-bold text-muted">
            {(token.symbol || "?")[0]}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CORE ORB — Bigger, more imposing
   ═══════════════════════════════════════════════════════════════════ */

function CoreOrb({ hotCount }: { hotCount: number }) {
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <motion.div
        className="absolute -inset-[130px] rounded-full border border-accent/6"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-0 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/35" />
        <div className="absolute bottom-0 left-1/2 w-1.5 h-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-blue-400/25" />
      </motion.div>
      <motion.div
        className="absolute -inset-[90px] rounded-full border border-accent/10"
        animate={{ rotate: -360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-1/2 right-0 w-1.5 h-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/45" />
        <div className="absolute top-1/2 left-0 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400/30" />
      </motion.div>
      <motion.div
        className="absolute -inset-[55px] rounded-full border border-accent/5"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      />

      <motion.div
        className="absolute -inset-24 rounded-full bg-accent/4 blur-3xl"
        animate={{ scale: [1, 1.25, 1], opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -inset-12 rounded-full bg-accent/8 blur-xl"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />

      <motion.div
        className="relative w-28 h-28 rounded-full flex items-center justify-center"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(circle at 35% 35%, rgba(0,229,160,0.22), rgba(0,229,160,0.06) 65%, transparent)",
          border: "1px solid rgba(0,229,160,0.15)",
          boxShadow: "0 0 50px rgba(0,229,160,0.1), inset 0 0 25px rgba(0,229,160,0.06)",
        }}
      >
        <div className="text-center">
          <div className="text-[9px] font-mono text-accent/50 uppercase tracking-[0.2em] mb-1">Open Claw</div>
          <div className="text-2xl font-heading font-black text-foreground leading-none">{hotCount}</div>
          <div className="text-[8px] text-muted/40 uppercase tracking-wider mt-1">active signals</div>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ORBIT TOOLTIP
   ═══════════════════════════════════════════════════════════════════ */

function OrbitTooltip({ token }: { token: Token }) {
  const mcap = displayMcap(token);
  const mult = getMultiplier(token);
  const change = mcapChange(token);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 5, scale: 0.95 }}
      transition={SPRING_SNAPPY}
      className="absolute top-[56%] left-1/2 -translate-x-1/2 z-50 pointer-events-none"
    >
      <div className="bg-background/90 backdrop-blur-xl border border-accent/20 rounded-xl px-3.5 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          {token.image && <img src={token.image} alt="" className="w-6 h-6 rounded-lg ring-1 ring-accent/20" />}
          <span className="text-xs font-bold text-foreground">{token.symbol}</span>
          <span className="text-[10px] font-mono text-foreground/50">{formatMcap(mcap)}</span>
          {mult != null && mult > 1 && (
            <span className={`text-[10px] font-mono font-bold ${mult >= 3 ? "text-yellow-400" : "text-accent"}`}>{mult.toFixed(1)}x</span>
          )}
          {change != null && (
            <span className={`text-[10px] font-mono ${change >= 0 ? "text-accent/70" : "text-danger/70"}`}>
              {change >= 0 ? "+" : ""}{change.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN HERO — Center-focused, immersive, in-your-face
   ═══════════════════════════════════════════════════════════════════ */

export function HeroSection({ tokens, hotTokens, allTokens, stats, hotCount, dexCacheSize, connected, onTokenClick }: HeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<MouseState>({ x: 0, y: 0, active: false });
  const [hoveredOrbit, setHoveredOrbit] = useState<Token | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const onLeave = () => { mouseRef.current.active = false; };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); };
  }, []);

  const recentTokens = useMemo(() => tokens.slice(0, 30), [tokens]);
  const [cardSlots, setCardSlots] = useState([
    { tokenIdx: 0, stage: 0, key: 0 },
    { tokenIdx: 1, stage: 1, key: 100 },
    { tokenIdx: 2, stage: 2, key: 200 },
    { tokenIdx: 3, stage: 3, key: 300 },
  ]);

  useEffect(() => {
    if (recentTokens.length === 0) return;
    let keyCounter = 400;
    const interval = setInterval(() => {
      setCardSlots((prev) =>
        prev.map((slot) => {
          const next = slot.stage + 1;
          if (next > 4) return { tokenIdx: (slot.tokenIdx + 4) % Math.max(recentTokens.length, 1), stage: 0, key: keyCounter++ };
          return { ...slot, stage: next };
        })
      );
    }, 1300);
    return () => clearInterval(interval);
  }, [recentTokens.length]);

  const orbiting = useMemo(() => hotTokens.filter((t) => t.image).slice(0, 10), [hotTokens]);

  const cardPositions: React.CSSProperties[] = useMemo(() => [
    { top: "3%", left: "0%" },
    { top: "3%", right: "0%" },
    { bottom: "3%", left: "0%" },
    { bottom: "3%", right: "0%" },
  ], []);

  return (
    <section ref={containerRef} className="relative overflow-hidden border-b border-border/50" style={{ minHeight: "max(85vh, 700px)" }}>
      <NeuralCanvas mouseRef={mouseRef} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-[1]" style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(3,3,5,0.8) 100%)" }} />

      {/* Ambient washes */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/[0.04] rounded-full blur-[180px]" />
        <div className="absolute top-[5%] right-[15%] w-[300px] h-[300px] bg-purple-500/[0.025] rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] left-[10%] w-[250px] h-[250px] bg-blue-500/[0.02] rounded-full blur-[100px]" />
      </div>

      {/* Noise */}
      <div className="absolute inset-0 pointer-events-none z-[2] opacity-[0.025]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      <div className="relative z-10 max-w-[1800px] mx-auto px-4 flex flex-col items-center justify-center" style={{ minHeight: "max(85vh, 700px)" }}>
        {/* Top: Branding */}
        <motion.div className="text-center mb-6 relative z-20" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_SMOOTH, delay: 0.1 }}>
          <motion.div
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-accent/8 border border-accent/15 text-accent text-xs font-bold mb-5 tracking-wider uppercase"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SPRING_SNAPPY, delay: 0.2 }}
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-accent"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1], boxShadow: ["0 0 0px rgba(0,229,160,0.4)", "0 0 12px rgba(0,229,160,0.6)", "0 0 0px rgba(0,229,160,0.4)"] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {connected ? "Open Claw Active" : "Connecting..."}
          </motion.div>
          <div className="overflow-hidden mb-3">
            <motion.h1
              className="text-5xl sm:text-6xl lg:text-7xl font-heading font-black tracking-tight"
              initial={{ y: "110%" }}
              animate={{ y: "0%" }}
              transition={{ ...SPRING_SNAPPY, delay: 0.3 }}
            >
              <span className="text-gradient-accent">ClawFi</span>
            </motion.h1>
          </div>
          <motion.p
            className="text-foreground/50 text-sm sm:text-base max-w-lg mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SMOOTH, delay: 0.45 }}
          >
            Open Claw monitors the entire Solana blockchain — analyzing every token, every trade, every signal — grading and executing on the highest-conviction opportunities in real-time.
          </motion.p>
        </motion.div>

        {/* Center: Visualization */}
        <motion.div
          className="relative w-full max-w-[900px] mx-auto"
          style={{ height: "clamp(360px, 45vh, 500px)" }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <CoreOrb hotCount={hotCount} />

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0">
            {orbiting.map((t, i) => (
              <OrbitToken key={t.address} token={t} index={i} total={orbiting.length} onHover={setHoveredOrbit} />
            ))}
          </div>

          <AnimatePresence>
            {hoveredOrbit && <OrbitTooltip token={hoveredOrbit} />}
          </AnimatePresence>

          {/* 4 Intelligence Cards — corners */}
          {cardSlots.map((slot, i) => {
            const token = recentTokens[slot.tokenIdx % Math.max(recentTokens.length, 1)];
            if (!token) return null;
            return (
              <div key={i} className="absolute z-20" style={cardPositions[i]}>
                <AnimatePresence mode="wait">
                  <IntelCard
                    key={slot.key}
                    token={token}
                    stage={slot.stage}
                    slotIndex={i}
                    onClick={() => onTokenClick?.(token)}
                  />
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>

        {/* Bottom: CTAs + Stats */}
        <motion.div className="text-center mt-6 relative z-20" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_SMOOTH, delay: 0.55 }}>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <Link href="/trading" className="inline-flex items-center gap-2 h-11 px-7 rounded-xl bg-accent text-black font-bold text-sm hover:bg-accent-bright transition-all shadow-[0_0_28px_rgba(0,229,160,0.2)] hover:shadow-[0_0_40px_rgba(0,229,160,0.35)]">
              Trading Engine
            </Link>
            <Link href="/wallet" className="inline-flex items-center gap-2 h-11 px-7 rounded-xl bg-surface border border-border text-foreground font-medium text-sm hover:border-border-bright hover:bg-surface-raised transition-all">
              Connect Wallet
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-center">
            {[
              { label: "Tracked", value: String(stats?.totalTokens ?? allTokens.length) },
              { label: "Signals", value: String(allTokens.length) },
              { label: "Hot", value: String(hotCount), accent: true },
              { label: "Graded", value: dexCacheSize > 0 ? String(dexCacheSize) : "—" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className={`text-xl sm:text-2xl font-heading font-black ${s.accent ? "text-accent" : "text-foreground"}`}>{s.value}</span>
                <span className="text-[10px] text-muted/50 uppercase tracking-wider mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Token, displayMcap, getMultiplier, mcapChange } from "@/components/TokenCard";
import { formatMcap } from "@/lib/utils";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PARTICLE_COUNT = 200;
const STREAM_COUNT = 44;
const CONN_DIST = 95;
const CONN_DIST_SQ = CONN_DIST * CONN_DIST;
const MOUSE_RADIUS = 220;
const CENTER_GRAVITY = 0.012;
const DAMPING = 0.986;

const COL = {
  accent: [0, 229, 160] as const,
  blue: [0, 160, 255] as const,
  purple: [140, 80, 255] as const,
};

const SPRING_SNAPPY = { type: "spring" as const, damping: 28, stiffness: 280 };
const SPRING_SMOOTH = { type: "spring" as const, damping: 22, stiffness: 100 };
const SPRING_BOUNCY = { type: "spring" as const, damping: 14, stiffness: 200 };

const ANALYSIS_STEPS = [
  "Scanning new token launch",
  "Tracking buy pressure & volume",
  "Analyzing holder distribution",
  "Computing signal strength",
];

const THINKING_LABELS = [
  "Thinking...",
  "Analyzing tokens...",
  "Scanning the chain...",
  "Computing signals...",
  "Evaluating momentum...",
];

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

interface MouseState { x: number; y: number; active: boolean; }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; baseSize: number; opacity: number; baseOpacity: number;
  color: readonly [number, number, number];
  isStream: boolean; angle: number; speed: number;
  phase: number; // unique phase offset for organic movement
  breathPhase: number; // for cluster breathing
}

interface SynapticPulse {
  fromIdx: number; toIdx: number;
  progress: number; // 0-1
  speed: number;
  color: readonly [number, number, number];
  opacity: number;
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
   CANVAS — Enhanced Neural Particle Mesh
   Synaptic firing, fluid mouse, organic breathing, energy waves
   ═══════════════════════════════════════════════════════════════════ */

function initParticles(w: number, h: number, pCount: number, sCount: number) {
  const particles: Particle[] = [];
  const colors = [COL.accent, COL.blue, COL.purple];
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < pCount; i++) {
    const baseSize = Math.random() * 2.2 + 0.5;
    const baseOpacity = Math.random() * 0.35 + 0.1;
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      size: baseSize, baseSize, opacity: baseOpacity, baseOpacity,
      color: colors[i < pCount * 0.55 ? 0 : Math.floor(Math.random() * 3)],
      isStream: false, angle: 0, speed: 0,
      phase: Math.random() * Math.PI * 2,
      breathPhase: Math.random() * Math.PI * 2,
    });
  }
  for (let i = 0; i < sCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(w, h) * 0.55;
    particles.push({
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
      vx: 0, vy: 0, size: Math.random() * 1.5 + 0.8, baseSize: 1,
      opacity: 0, baseOpacity: 0.6,
      color: COL.accent, isStream: true, angle,
      speed: Math.random() * 1.4 + 0.8,
      phase: Math.random() * Math.PI * 2,
      breathPhase: 0,
    });
  }
  return particles;
}

function NeuralCanvas({ mouseRef }: { mouseRef: React.RefObject<MouseState | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const stateRef = useRef<{
    particles: Particle[]; w: number; h: number; time: number;
    pulses: SynapticPulse[]; lastPulseTime: number;
    energyWaveTime: number;
  }>({
    particles: [], w: 0, h: 0, time: 0,
    pulses: [], lastPulseTime: 0,
    energyWaveTime: 0,
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
      state.particles = initParticles(state.w, state.h, mobile ? 100 : PARTICLE_COUNT, mobile ? 18 : STREAM_COUNT);
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      const { w, h, particles } = state;
      if (w === 0) { rafRef.current = requestAnimationFrame(animate); return; }
      const cx = w / 2, cy = h / 2;
      const mouse = mouseRef.current;
      state.time++;
      const t = state.time;
      ctx.clearRect(0, 0, w, h);

      // Global breathing factor — makes the whole mesh feel alive
      const breathCycle = Math.sin(t * 0.008) * 0.5 + 0.5; // 0..1 slow oscillation
      const microBreath = Math.sin(t * 0.025) * 0.3; // faster subtle pulse

      // Energy wave: a ring of brightness that expands from center periodically
      state.energyWaveTime += 0.004;
      const waveRadius = (state.energyWaveTime % 1) * Math.max(w, h) * 0.6;
      const waveStrength = 1 - (state.energyWaveTime % 1); // fades as it expands

      const regular: Particle[] = [];
      const streams: Particle[] = [];

      for (const p of particles) {
        if (p.isStream) {
          streams.push(p);
          const dx = cx - p.x, dy = cy - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 28) {
            // Reset to edge with slight variation
            p.angle = Math.random() * Math.PI * 2;
            const edge = Math.max(w, h) * (0.5 + Math.random() * 0.1);
            p.x = cx + Math.cos(p.angle) * edge;
            p.y = cy + Math.sin(p.angle) * edge;
            p.opacity = 0;
          } else {
            // Slightly curved path toward center (not perfectly straight)
            const curvature = Math.sin(t * 0.01 + p.phase) * 0.15;
            const nx = dx / dist, ny = dy / dist;
            // Perpendicular vector for curve
            const px = -ny, py = nx;
            p.x += (nx + px * curvature) * p.speed;
            p.y += (ny + py * curvature) * p.speed;
            p.opacity = Math.min(0.65, p.opacity + 0.008);
          }
        } else {
          regular.push(p);
          const dx = cx - p.x, dy = cy - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Organic gravity — stronger when further but with breathing modulation
          const gravStr = CENTER_GRAVITY * (1 + breathCycle * 0.3);
          if (dist > 35) {
            p.vx += (dx / dist) * gravStr;
            p.vy += (dy / dist) * gravStr;
          }

          // Add very subtle orbital drift (particles slowly swirl, not just converge)
          if (dist > 50 && dist < 350) {
            const orbitalStr = 0.0008;
            p.vx += (-dy / dist) * orbitalStr;
            p.vy += (dx / dist) * orbitalStr;
          }

          // Organic micro-movement per particle
          p.vx += Math.sin(t * 0.015 + p.phase) * 0.008;
          p.vy += Math.cos(t * 0.013 + p.phase * 1.3) * 0.008;

          // Fluid mouse interaction — particles flow AROUND the cursor like water
          if (mouse && mouse.active) {
            const mdx = p.x - mouse.x, mdy = p.y - mouse.y;
            const mdSq = mdx * mdx + mdy * mdy;
            if (mdSq < MOUSE_RADIUS * MOUSE_RADIUS && mdSq > 4) {
              const md = Math.sqrt(mdSq);
              const proximity = 1 - md / MOUSE_RADIUS;
              const proximitySq = proximity * proximity;

              // Repulsion (push away)
              const repulse = proximitySq * 0.35;
              p.vx += (mdx / md) * repulse;
              p.vy += (mdy / md) * repulse;

              // Tangential flow (swirl around cursor like fluid)
              const tangent = proximitySq * 0.2;
              p.vx += (-mdy / md) * tangent;
              p.vy += (mdx / md) * tangent;

              // Particles near mouse glow brighter
              p.opacity = Math.min(0.75, p.baseOpacity + proximitySq * 0.4);
              p.size = p.baseSize + proximitySq * 1.5;
            } else {
              // Gradually return to base
              p.opacity += (p.baseOpacity - p.opacity) * 0.03;
              p.size += (p.baseSize - p.size) * 0.03;
            }
          } else {
            p.opacity += (p.baseOpacity - p.opacity) * 0.02;
            p.size += (p.baseSize - p.size) * 0.02;
          }

          // Cluster breathing — particles near center expand/contract together
          if (dist < 200) {
            const breathInfluence = (1 - dist / 200) * 0.4;
            const breathOffset = Math.sin(t * 0.01 + p.breathPhase) * breathInfluence;
            p.vx += (dx / dist) * breathOffset * -0.02; // push out on exhale
            p.vy += (dy / dist) * breathOffset * -0.02;
          }

          // Energy wave interaction — particles brighten as wave passes through
          const waveDist = Math.abs(dist - waveRadius);
          if (waveDist < 40 && waveStrength > 0.1) {
            const waveInfluence = (1 - waveDist / 40) * waveStrength * 0.25;
            p.opacity = Math.min(0.8, p.opacity + waveInfluence);
            p.size = Math.min(p.baseSize + 1.5, p.size + waveInfluence * 2);
          }

          p.vx *= DAMPING; p.vy *= DAMPING; p.x += p.vx; p.y += p.vy;
          if (p.x < -30) p.x = w + 30; if (p.x > w + 30) p.x = -30;
          if (p.y < -30) p.y = h + 30; if (p.y > h + 30) p.y = -30;
        }
      }

      // --- Synaptic pulses: spawn new ones naturally ---
      if (t - state.lastPulseTime > 12 && regular.length > 10) {
        // Pick a random connected pair near center and fire a pulse along it
        const candidates: [number, number][] = [];
        for (let i = 0; i < regular.length; i++) {
          for (let j = i + 1; j < regular.length; j++) {
            const dx = regular[i].x - regular[j].x, dy = regular[i].y - regular[j].y;
            if (dx * dx + dy * dy < CONN_DIST_SQ) {
              candidates.push([i, j]);
            }
          }
          if (candidates.length > 20) break; // enough candidates
        }
        if (candidates.length > 0) {
          const [fi, ti] = candidates[Math.floor(Math.random() * candidates.length)];
          state.pulses.push({
            fromIdx: fi, toIdx: ti,
            progress: 0, speed: 0.03 + Math.random() * 0.02,
            color: COL.accent, opacity: 0.5 + Math.random() * 0.3,
          });
          state.lastPulseTime = t;
        }
      }

      // Update and render synaptic pulses
      state.pulses = state.pulses.filter(pulse => {
        pulse.progress += pulse.speed;
        if (pulse.progress >= 1) return false;
        if (pulse.fromIdx >= regular.length || pulse.toIdx >= regular.length) return false;

        const from = regular[pulse.fromIdx];
        const to = regular[pulse.toIdx];
        const px = from.x + (to.x - from.x) * pulse.progress;
        const py = from.y + (to.y - from.y) * pulse.progress;
        const fadeAlpha = pulse.opacity * Math.sin(pulse.progress * Math.PI); // fade in/out

        // Glowing dot traveling along connection
        const glowSize = 3 + Math.sin(pulse.progress * Math.PI) * 2;
        ctx.beginPath(); ctx.arc(px, py, glowSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pulse.color[0]},${pulse.color[1]},${pulse.color[2]},${fadeAlpha * 0.6})`;
        ctx.fill();

        // Larger soft glow
        ctx.beginPath(); ctx.arc(px, py, glowSize * 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pulse.color[0]},${pulse.color[1]},${pulse.color[2]},${fadeAlpha * 0.08})`;
        ctx.fill();

        return true;
      });

      // --- Connections with energy wave modulation ---
      ctx.lineWidth = 0.5;
      for (let i = 0; i < regular.length; i++) {
        for (let j = i + 1; j < regular.length; j++) {
          const dx = regular[i].x - regular[j].x, dy = regular[i].y - regular[j].y;
          const dSq = dx * dx + dy * dy;
          if (dSq < CONN_DIST_SQ) {
            const d = Math.sqrt(dSq);
            let alpha = (1 - d / CONN_DIST) * 0.14;

            // Mouse proximity brightens connections
            if (mouse && mouse.active) {
              const mx = (regular[i].x + regular[j].x) / 2, my = (regular[i].y + regular[j].y) / 2;
              const mDist = Math.sqrt((mx - mouse.x) ** 2 + (my - mouse.y) ** 2);
              if (mDist < MOUSE_RADIUS) {
                const prox = 1 - mDist / MOUSE_RADIUS;
                alpha += prox * prox * 0.22;
              }
            }

            // Energy wave brightens connections as it passes
            const midX = (regular[i].x + regular[j].x) / 2;
            const midY = (regular[i].y + regular[j].y) / 2;
            const midDist = Math.sqrt((midX - cx) ** 2 + (midY - cy) ** 2);
            const wDist = Math.abs(midDist - waveRadius);
            if (wDist < 50 && waveStrength > 0.1) {
              alpha += (1 - wDist / 50) * waveStrength * 0.12;
            }

            // Subtle color shift based on distance from center
            const centerDist = Math.sqrt((midX - cx) ** 2 + (midY - cy) ** 2);
            const colorMix = Math.min(1, centerDist / 400);
            const cr = Math.round(COL.accent[0] * (1 - colorMix) + COL.blue[0] * colorMix);
            const cg = Math.round(COL.accent[1] * (1 - colorMix) + COL.blue[1] * colorMix);
            const cb = Math.round(COL.accent[2] * (1 - colorMix) + COL.blue[2] * colorMix);

            ctx.beginPath(); ctx.moveTo(regular[i].x, regular[i].y); ctx.lineTo(regular[j].x, regular[j].y);
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
            ctx.stroke();
          }
        }
      }

      // --- Data streams with curved paths ---
      for (const p of streams) {
        const dx = cx - p.x, dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        const trailLen = Math.min(45, p.speed * 13);
        const nx = dx / dist, ny = dy / dist;
        const colorT = dist / (Math.max(w, h) * 0.5);
        const r = Math.round(COL.accent[0] * colorT + COL.blue[0] * (1 - colorT));
        const g = Math.round(COL.accent[1] * colorT + COL.blue[1] * (1 - colorT));
        const b = Math.round(COL.accent[2] * colorT + COL.blue[2] * (1 - colorT));
        const grad = ctx.createLinearGradient(p.x, p.y, p.x - nx * trailLen, p.y - ny * trailLen);
        grad.addColorStop(0, `rgba(${r},${g},${b},${p.opacity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - nx * trailLen, p.y - ny * trailLen);
        ctx.strokeStyle = grad; ctx.lineWidth = p.size; ctx.stroke();
      }

      // --- Particle dots ---
      for (const p of particles) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${p.opacity})`;
        ctx.fill();
        // Soft halo on larger particles
        if (p.size > 1.3) {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${p.opacity * 0.07})`;
          ctx.fill();
        }
      }

      // --- Organic pulse rings from center (breathing, not mechanical) ---
      for (let r = 0; r < 4; r++) {
        const ringPhase = ((t * 0.003 + r * 0.25) % 1);
        const radius = ringPhase * Math.min(w, h) * 0.42;
        const alpha = (1 - ringPhase) * (0.04 + microBreath * 0.02);
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,229,160,${Math.max(0, alpha)})`;
        ctx.lineWidth = 1 + (1 - ringPhase) * 0.5;
        ctx.stroke();
      }

      // --- Subtle hexagonal structure near center (neural architecture) ---
      for (let ring = 1; ring <= 3; ring++) {
        const r = ring * 30;
        const rotSpeed = ring % 2 === 0 ? 0.002 : -0.0015;
        const hexAlpha = 0.025 + Math.sin(t * 0.015 + ring) * 0.01;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + t * rotSpeed;
          const hx = cx + Math.cos(a) * r;
          const hy = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(0,229,160,${hexAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [mouseRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.8 }} />;
}

/* ═══════════════════════════════════════════════════════════════════
   INTELLIGENCE CARD
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
      initial={{ opacity: 0, scale: 0.7, filter: "blur(12px)" }}
      animate={{
        opacity: 1, scale: 1, filter: "blur(0px)",
        y: [0, -8, 0, 8, 0],
      }}
      exit={{ opacity: 0, scale: 0.75, filter: "blur(10px)" }}
      transition={{
        ...SPRING_SMOOTH,
        y: { duration: 5 + slotIndex * 0.8, repeat: Infinity, ease: "easeInOut" },
        filter: { duration: 0.4 },
      }}
      onClick={onClick}
      className="w-[280px] cursor-pointer group/card"
    >
      <div className="relative bg-background/70 backdrop-blur-2xl border border-accent/12 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,229,160,0.08),0_12px_40px_rgba(0,0,0,0.5)] group-hover/card:border-accent/30 group-hover/card:shadow-[0_0_100px_rgba(0,229,160,0.15),0_16px_60px_rgba(0,0,0,0.6)] transition-all duration-300 group-hover/card:scale-[1.02]">
        {/* Scan line */}
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent pointer-events-none z-10"
          animate={{ top: ["-2%", "105%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: slotIndex * 0.5 }}
        />

        {/* Corner brackets */}
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-accent/30 rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-accent/30 rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-accent/30 rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-accent/30 rounded-br-xl" />

        <div className="relative p-5 z-[2]">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3.5">
            {token.image ? (
              <div className="relative shrink-0">
                <img src={token.image} alt="" className="w-11 h-11 rounded-xl ring-1 ring-accent/20 object-cover" />
                {stage >= 3 && (
                  <motion.div
                    className="absolute -inset-2 rounded-xl border border-accent/40"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl bg-surface-raised ring-1 ring-border flex items-center justify-center text-sm text-muted font-bold shrink-0">
                {(token.symbol || "?")[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground truncate">{token.symbol || "???"}</div>
              <div className="text-[11px] text-foreground/40 truncate">{token.name || "Unknown"}</div>
            </div>
            <AnimatePresence>
              {isHot && stage >= 2 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={SPRING_BOUNCY}
                  className="text-[9px] font-black bg-accent/15 text-accent px-2 py-1 rounded-lg border border-accent/25"
                >
                  HOT
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pipeline progress */}
          <div className="flex gap-1 mb-3">
            {[0, 1, 2, 3].map((s) => (
              <div key={s} className="h-1.5 flex-1 rounded-full bg-border/30 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-bright"
                  initial={{ width: "0%" }}
                  animate={{ width: s <= stage ? "100%" : "0%" }}
                  transition={{ duration: 0.4, delay: s * 0.12, ease: "easeOut" }}
                />
              </div>
            ))}
          </div>

          {/* Analysis label */}
          <div className="flex items-center gap-2 mb-2.5">
            <motion.div
              className="w-2 h-2 rounded-full bg-accent"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-[11px] font-mono text-accent/60 tracking-wide">
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
                <div className="flex items-center gap-3 text-sm mb-2">
                  <span className="text-foreground/70 font-mono font-bold">{formatMcap(mcap)}</span>
                  {mult != null && mult > 1 && (
                    <motion.span
                      className={`font-black font-mono ${mult >= 5 ? "text-yellow-400" : mult >= 3 ? "text-accent" : "text-accent/80"}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={SPRING_BOUNCY}
                      style={{ textShadow: mult >= 3 ? "0 0 10px currentColor" : "none" }}
                    >
                      {mult.toFixed(1)}x
                    </motion.span>
                  )}
                  {change != null && (
                    <span className={`font-mono font-bold ${change >= 0 ? "text-accent/80" : "text-danger/80"}`}>
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
                className="flex items-center justify-between pt-2 border-t border-accent/10"
              >
                <div className="flex items-center gap-1.5">
                  <div className="text-[10px] font-mono text-accent/70 uppercase tracking-widest">Signal Locked</div>
                  <motion.div
                    className="w-2 h-2 rounded-full bg-accent"
                    animate={{ boxShadow: ["0 0 4px rgba(0,229,160,0.3)", "0 0 16px rgba(0,229,160,0.7)", "0 0 4px rgba(0,229,160,0.3)"] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                </div>
                <span className="text-[10px] text-foreground/40 group-hover/card:text-accent transition-colors font-bold">VIEW DETAILS →</span>
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
  const radius = 140 + (index % 3) * 40;
  const duration = 22 + index * 2.2;

  return (
    <motion.div
      className="absolute top-1/2 left-1/2"
      style={{ width: 0, height: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      <motion.div
        className="absolute cursor-pointer"
        style={{ left: radius, top: -20, width: 40, height: 40 }}
        animate={{ rotate: -360 }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
        whileHover={{ scale: 1.8, zIndex: 50 }}
        onHoverStart={() => onHover?.(token)}
        onHoverEnd={() => onHover?.(null)}
      >
        {token.image ? (
          <img
            src={token.image}
            alt={token.symbol || ""}
            className={`w-10 h-10 rounded-full transition-all duration-300 ${
              isHot
                ? "ring-2 ring-accent/50 shadow-[0_0_24px_rgba(0,229,160,0.4)]"
                : "ring-1 ring-white/15 shadow-[0_0_12px_rgba(0,0,0,0.5)]"
            }`}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-surface-raised ring-1 ring-border/40 flex items-center justify-center text-[11px] font-bold text-muted">
            {(token.symbol || "?")[0]}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CORE ORB
   ═══════════════════════════════════════════════════════════════════ */

function CoreOrb({ hotCount }: { hotCount: number }) {
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <motion.div
        className="absolute -inset-[150px] rounded-full border border-accent/5"
        animate={{ rotate: 360 }}
        transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-0 left-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/40" />
        <div className="absolute bottom-0 left-1/2 w-1.5 h-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-blue-400/30" />
        <div className="absolute top-1/2 right-0 w-1 h-1 translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400/25" />
      </motion.div>

      <motion.div
        className="absolute -inset-[100px] rounded-full border border-accent/8"
        animate={{ rotate: -360 }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-1/2 right-0 w-2 h-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/50" />
        <div className="absolute top-1/2 left-0 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400/35" />
      </motion.div>

      <motion.div
        className="absolute -inset-[65px] rounded-full border border-accent/6"
        animate={{ rotate: 360 }}
        transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute bottom-0 left-1/2 w-1 h-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent/35" />
      </motion.div>

      <motion.div
        className="absolute -inset-28 rounded-full bg-accent/3 blur-3xl"
        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -inset-16 rounded-full bg-accent/6 blur-2xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <motion.div
        className="absolute -inset-8 rounded-full bg-accent/10 blur-xl"
        animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <motion.div
        className="relative w-32 h-32 rounded-full flex items-center justify-center"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(circle at 35% 35%, rgba(0,229,160,0.25), rgba(0,229,160,0.08) 60%, rgba(0,229,160,0.02) 100%)",
          border: "1.5px solid rgba(0,229,160,0.2)",
          boxShadow: "0 0 60px rgba(0,229,160,0.12), inset 0 0 30px rgba(0,229,160,0.08)",
        }}
      >
        <div className="text-center">
          <div className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-1">ClawFi</div>
          <div className="text-3xl font-heading font-black text-foreground leading-none">{hotCount}</div>
          <div className="text-[9px] text-foreground/40 uppercase tracking-wider mt-1">active signals</div>
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
      <div className="bg-background/92 backdrop-blur-xl border border-accent/25 rounded-xl px-4 py-2.5 shadow-[0_8px_40px_rgba(0,0,0,0.6)] whitespace-nowrap">
        <div className="flex items-center gap-3">
          {token.image && <img src={token.image} alt="" className="w-7 h-7 rounded-lg ring-1 ring-accent/20" />}
          <span className="text-sm font-bold text-foreground">{token.symbol}</span>
          <span className="text-[11px] font-mono text-foreground/60">{formatMcap(mcap)}</span>
          {mult != null && mult > 1 && (
            <span className={`text-[11px] font-mono font-bold ${mult >= 3 ? "text-yellow-400" : "text-accent"}`}>{mult.toFixed(1)}x</span>
          )}
          {change != null && (
            <span className={`text-[11px] font-mono font-bold ${change >= 0 ? "text-accent" : "text-danger"}`}>
              {change >= 0 ? "+" : ""}{change.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   THINKING CYCLER — Animated text cycling through AI states
   ═══════════════════════════════════════════════════════════════════ */

function ThinkingCycler() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % THINKING_LABELS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-4 overflow-hidden min-w-[130px]">
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          className="absolute inset-0 text-[11px] font-mono text-foreground/45 whitespace-nowrap"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          {THINKING_LABELS[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN HERO
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
    { top: "2%", left: "0%" },
    { top: "2%", right: "0%" },
    { bottom: "2%", left: "0%" },
    { bottom: "2%", right: "0%" },
  ], []);

  return (
    <section ref={containerRef} className="relative overflow-hidden border-b border-border/50" style={{ minHeight: "100vh" }}>
      <NeuralCanvas mouseRef={mouseRef} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-[1]" style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 20%, rgba(3,3,5,0.85) 100%)" }} />

      {/* Ambient washes */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-accent/[0.04] rounded-full blur-[200px]" />
        <div className="absolute top-[5%] right-[15%] w-[350px] h-[350px] bg-purple-500/[0.03] rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] left-[10%] w-[300px] h-[300px] bg-blue-500/[0.025] rounded-full blur-[120px]" />
      </div>

      {/* Noise */}
      <div className="absolute inset-0 pointer-events-none z-[2] opacity-[0.02]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      <div className="relative z-10 max-w-[1800px] mx-auto px-4 flex flex-col items-center justify-center" style={{ minHeight: "100vh" }}>
        {/* Top: Branding */}
        <motion.div className="text-center mb-8 relative z-20" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_SMOOTH, delay: 0.1 }}>
          <motion.div
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-accent/8 border border-accent/15 text-accent text-xs font-bold mb-5 tracking-wider uppercase"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SPRING_SNAPPY, delay: 0.2 }}
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-accent"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1], boxShadow: ["0 0 0px rgba(0,229,160,0.4)", "0 0 14px rgba(0,229,160,0.7)", "0 0 0px rgba(0,229,160,0.4)"] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {connected ? "Scanning Solana — Live" : "Connecting..."}
          </motion.div>

          <div className="overflow-hidden mb-4">
            <motion.h1
              className="text-5xl sm:text-6xl lg:text-8xl font-heading font-black tracking-tight"
              initial={{ y: "110%" }}
              animate={{ y: "0%" }}
              transition={{ ...SPRING_SNAPPY, delay: 0.3 }}
            >
              <span className="text-gradient-accent">ClawFi</span>
            </motion.h1>
          </div>

          <motion.p
            className="text-foreground/55 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SMOOTH, delay: 0.45 }}
          >
            We scan every new Solana token the second it launches.
            The ones worth watching? We grade them, track them, and trade them — before the crowd shows up.
          </motion.p>

          {/* Live Intelligence Indicator */}
          <motion.div
            className="mt-5 flex items-center gap-3 px-5 py-2.5 rounded-full bg-background/60 backdrop-blur-xl border border-accent/15 shadow-[0_0_30px_rgba(0,229,160,0.06)]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SPRING_SMOOTH, delay: 0.6 }}
          >
            <div className="relative flex items-center justify-center w-5 h-5">
              <motion.div
                className="absolute inset-0 rounded-full bg-accent/20"
                animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            </div>
            <span className="text-[11px] font-bold text-accent/90 uppercase tracking-widest">Live Intelligence</span>
            <span className="text-[10px] text-foreground/40">—</span>
            <ThinkingCycler />
          </motion.div>
        </motion.div>

        {/* Center: Visualization */}
        <motion.div
          className="relative w-full max-w-[1050px] mx-auto"
          style={{ height: "clamp(400px, 50vh, 580px)" }}
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
        <motion.div className="text-center mt-8 relative z-20" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_SMOOTH, delay: 0.55 }}>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <Link href="/trading" className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-accent text-black font-bold text-sm hover:bg-accent-bright transition-all shadow-[0_0_30px_rgba(0,229,160,0.2)] hover:shadow-[0_0_50px_rgba(0,229,160,0.4)] hover:scale-105">
              Open Trading Engine
            </Link>
            <Link href="/wallet" className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-surface border border-border text-foreground font-medium text-sm hover:border-accent/30 hover:bg-surface-raised transition-all hover:scale-105">
              Connect Wallet
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 text-center">
            {[
              { label: "Tokens Tracked", value: String(stats?.totalTokens ?? allTokens.length) },
              { label: "Signals Found", value: String(allTokens.length) },
              { label: "Hot Right Now", value: String(hotCount), accent: true },
              { label: "Graded", value: dexCacheSize > 0 ? String(dexCacheSize) : "—" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className={`text-2xl sm:text-3xl font-heading font-black ${s.accent ? "text-accent" : "text-foreground"}`}>{s.value}</span>
                <span className="text-[11px] text-foreground/40 uppercase tracking-wider mt-1">{s.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

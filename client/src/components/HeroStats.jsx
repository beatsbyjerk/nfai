import { useState, useEffect } from 'react';

// Animated counter hook
function useCountUp(target, duration = 2000) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    if (target <= 0) {
      setCount(0);
      return;
    }
    
    let startTime;
    let animationFrame;
    
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * easeOut));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [target, duration]);
  
  return count;
}

// Individual stat card
function StatCard({ value, label, suffix = '', prefix = '', color, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  const displayValue = useCountUp(visible ? value : 0, 2000);
  
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  return (
    <div 
      className="stat-card"
      style={{
        '--card-color': color,
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="stat-glow" />
      <div className="stat-value">
        {prefix}{displayValue}{suffix}
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-bar" />
    </div>
  );
}

export function HeroStats({ winRate = 87, totalCalls = 0, avgPeak = 1.5 }) {
  const safeWinRate = Number.isFinite(winRate) ? Math.round(winRate) : 87;
  const safeTotalCalls = Number.isFinite(totalCalls) ? totalCalls : 0;
  const safeAvgPeak = Number.isFinite(avgPeak) ? Math.round(avgPeak * 10) / 10 : 1.5;
  
  return (
    <div className="hero-stats-wrapper">
      <div className="stats-container">
        <StatCard
          value={safeWinRate}
          label="Win Rate"
          suffix="%"
          color="#10b981"
          delay={0}
        />
        <StatCard
          value={safeTotalCalls}
          label="Calls"
          color="#3b82f6"
          delay={150}
        />
        <StatCard
          value={Math.round(safeAvgPeak * 10)}
          label="Avg Peak"
          suffix="x"
          color="#8b5cf6"
          delay={300}
        />
      </div>
      
      {/* Floating particles */}
      <div className="particles">
        {[...Array(8)].map((_, i) => (
          <div 
            key={i} 
            className="particle"
            style={{
              '--i': i,
              '--color': i % 3 === 0 ? '#10b981' : i % 3 === 1 ? '#3b82f6' : '#8b5cf6',
            }}
          />
        ))}
      </div>
      
      <style>{`
        .hero-stats-wrapper {
          position: relative;
          padding: 1rem 0;
        }
        
        .stats-container {
          display: flex;
          gap: 1.5rem;
          justify-content: flex-start;
          position: relative;
          z-index: 2;
        }
        
        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.5rem 2rem;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          box-shadow: 0 8px 32px color-mix(in srgb, var(--card-color) 20%, transparent);
          border: 2px solid color-mix(in srgb, var(--card-color) 30%, transparent);
          min-width: 130px;
          position: relative;
          overflow: hidden;
          animation: slideUp 0.6s ease-out both;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px color-mix(in srgb, var(--card-color) 30%, transparent);
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .stat-glow {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, color-mix(in srgb, var(--card-color) 10%, transparent) 0%, transparent 70%);
          animation: pulse 3s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        
        .stat-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, var(--card-color), transparent);
          animation: shimmer 2s ease-in-out infinite;
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .stat-value {
          font-size: 2.5rem;
          font-weight: 800;
          color: var(--card-color);
          line-height: 1;
          font-family: 'Inter', system-ui, sans-serif;
          position: relative;
          z-index: 1;
        }
        
        .stat-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 0.5rem;
          position: relative;
          z-index: 1;
        }
        
        .particles {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }
        
        .particle {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color);
          opacity: 0;
          animation: float 4s ease-in-out infinite;
          animation-delay: calc(var(--i) * 0.5s);
          left: calc(10% + var(--i) * 10%);
          top: 50%;
        }
        
        @keyframes float {
          0%, 100% {
            opacity: 0;
            transform: translateY(20px);
          }
          20% {
            opacity: 0.6;
          }
          50% {
            opacity: 0.4;
            transform: translateY(-30px);
          }
          80% {
            opacity: 0.2;
          }
        }
        
        @media (max-width: 768px) {
          .stats-container {
            flex-wrap: wrap;
            justify-content: center;
          }
          .stat-card {
            min-width: 100px;
            padding: 1rem 1.5rem;
          }
          .stat-value {
            font-size: 2rem;
          }
        }
      `}</style>
    </div>
  );
}

export default HeroStats;

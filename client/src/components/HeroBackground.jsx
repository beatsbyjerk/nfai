export function HeroBackground() {
  return (
    <div className="hero-bg-animation">
      {/* Floating orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
      
      {/* Grid lines */}
      <div className="grid-overlay" />
      
      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <div 
          key={i} 
          className={`particle particle-${i % 3}`}
          style={{
            left: `${8 + i * 7}%`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
      
      {/* Data streams */}
      {[...Array(5)].map((_, i) => (
        <div 
          key={i} 
          className="data-stream"
          style={{
            left: `${15 + i * 18}%`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
      
      {/* Central glow */}
      <div className="central-glow" />
      
      <style>{`
        .hero-bg-animation {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }
        
        /* Floating orbs */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          animation: float 8s ease-in-out infinite;
        }
        
        .orb-1 {
          left: 10%;
          top: 20%;
          width: 300px;
          height: 300px;
          background: rgba(37, 99, 235, 0.25);
          animation-delay: 0s;
        }
        
        .orb-2 {
          right: 10%;
          top: 50%;
          width: 400px;
          height: 400px;
          background: rgba(139, 92, 246, 0.2);
          animation-delay: -2s;
          animation-duration: 10s;
        }
        
        .orb-3 {
          right: 20%;
          top: 10%;
          width: 250px;
          height: 250px;
          background: rgba(16, 185, 129, 0.2);
          animation-delay: -4s;
          animation-duration: 7s;
        }
        
        .orb-4 {
          left: 30%;
          bottom: 10%;
          width: 350px;
          height: 350px;
          background: rgba(59, 130, 246, 0.15);
          animation-delay: -1s;
          animation-duration: 9s;
        }
        
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.4;
          }
          25% {
            transform: translate(20px, -30px) scale(1.1);
            opacity: 0.6;
          }
          50% {
            transform: translate(-10px, 20px) scale(0.95);
            opacity: 0.5;
          }
          75% {
            transform: translate(15px, 10px) scale(1.05);
            opacity: 0.55;
          }
        }
        
        /* Grid overlay */
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(37, 99, 235, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37, 99, 235, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridPulse 4s ease-in-out infinite;
        }
        
        @keyframes gridPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        
        /* Particles */
        .particle {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          bottom: 20%;
          animation: particleFloat 4s ease-in-out infinite;
        }
        
        .particle-0 {
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
        }
        
        .particle-1 {
          background: #3b82f6;
          box-shadow: 0 0 10px #3b82f6;
        }
        
        .particle-2 {
          background: #8b5cf6;
          box-shadow: 0 0 10px #8b5cf6;
        }
        
        @keyframes particleFloat {
          0%, 100% {
            transform: translateY(0);
            opacity: 0;
          }
          20% {
            opacity: 0.6;
          }
          50% {
            transform: translateY(-100px);
            opacity: 0.4;
          }
          80% {
            opacity: 0.2;
          }
          100% {
            transform: translateY(-150px);
            opacity: 0;
          }
        }
        
        /* Data streams */
        .data-stream {
          position: absolute;
          width: 2px;
          height: 40px;
          background: linear-gradient(180deg, transparent, #3b82f6, transparent);
          border-radius: 2px;
          animation: streamFall 3s linear infinite;
          opacity: 0;
        }
        
        @keyframes streamFall {
          0% {
            top: -5%;
            opacity: 0;
          }
          10% {
            opacity: 0.5;
          }
          90% {
            opacity: 0.5;
          }
          100% {
            top: 105%;
            opacity: 0;
          }
        }
        
        /* Central glow */
        .central-glow {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 600px;
          height: 600px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, transparent 70%);
          animation: centralPulse 5s ease-in-out infinite;
        }
        
        @keyframes centralPulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}

export default HeroBackground;

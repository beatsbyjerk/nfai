import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const Ring = ({ radius, speed, color, thickness, dashArray, opacity }) => {
    const frame = useCurrentFrame();
    const rotation = (frame * speed) % 360;

    return (
        <div style={{
            position: 'absolute',
            width: radius * 2,
            height: radius * 2,
            borderRadius: '50%',
            border: `${thickness}px solid ${color}`,
            borderStyle: dashArray ? 'dashed' : 'solid',
            opacity: opacity,
            transform: `rotate(${rotation}deg) rotateX(60deg) scaleY(0.6)`,
            boxShadow: `0 0 15px ${color}`,
            filter: 'blur(0.5px)'
        }} />
    );
};

const DataParticle = ({ delay, speed, radius }) => {
    const frame = useCurrentFrame();
    const t = (frame - delay) * speed;
    if (t < 0) return null;

    const y = interpolate(t % 100, [0, 100], [100, -100]);
    const opacity = interpolate(t % 100, [0, 20, 80, 100], [0, 1, 1, 0]);

    return (
        <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: '#00FF9D',
            transform: `translate(-50%, ${y}px) rotate(${frame}deg) translateX(${radius}px)`,
            opacity,
            boxShadow: '0 0 10px #00FF9D'
        }} />
    );
};

const Core = () => {
    const frame = useCurrentFrame();
    const pulse = interpolate(Math.sin(frame / 10), [-1, 1], [0.8, 1.2]);

    return (
        <div style={{
            position: 'absolute',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #D4AF37 0%, rgba(212, 175, 55, 0) 70%)',
            transform: `scale(${pulse})`,
            boxShadow: '0 0 40px rgba(212, 175, 55, 0.6)',
            opacity: 0.9
        }} />
    );
};

export const RemotionComposition = () => {
    return (
        <AbsoluteFill style={{
            backgroundColor: 'transparent', // Transparent background for integration
            alignItems: 'center',
            justifyContent: 'center',
            perspective: '1000px'
        }}>
            {/* The Oracle Eye / Core */}
            <Core />

            {/* Orbital Rings representing Market Cycles */}
            <Ring radius={120} speed={0.5} color="rgba(0, 255, 157, 0.3)" thickness={1} dashArray={false} opacity={0.6} />
            <Ring radius={160} speed={-0.3} color="rgba(212, 175, 55, 0.2)" thickness={2} dashArray={true} opacity={0.4} />
            <Ring radius={220} speed={0.2} color="rgba(0, 255, 157, 0.1)" thickness={1} dashArray={false} opacity={0.3} />

            {/* Floating Data Particles */}
            {Array.from({ length: 12 }).map((_, i) => (
                <DataParticle key={i} delay={i * 5} speed={0.5} radius={140} />
            ))}

            {/* Central Glow */}
            <div style={{
                position: 'absolute',
                width: '400px',
                height: '400px',
                background: 'radial-gradient(circle, rgba(11, 26, 47, 0) 0%, rgba(11, 26, 47, 0.8) 100%)', // Vignette to blend edges
                pointerEvents: 'none'
            }} />

        </AbsoluteFill>
    );
};

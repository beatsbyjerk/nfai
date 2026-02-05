import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, random } from 'remotion';

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

const DataParticle = ({ delay, speed, radius, index }) => {
    const frame = useCurrentFrame();
    const t = (frame - delay) * speed;
    if (t < 0) return null;

    // Complex orbital path
    const angle = (t * 2 + index * 30) % 360;
    const rad = angle * (Math.PI / 180);
    const x = Math.cos(rad) * radius;
    const z = Math.sin(rad) * radius;

    // Project 3D to 2D (approximate isometric)
    const y = z * 0.4; // flatten 'z'

    const opacity = interpolate(Math.sin(frame / 10 + index), [-1, 1], [0.3, 1]);

    return (
        <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: index % 2 === 0 ? '#00FF9D' : '#D4AF37', // Green or Gold
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
            opacity,
            boxShadow: `0 0 12px ${index % 2 === 0 ? '#00FF9D' : '#D4AF37'}`
        }} />
    );
};

const Core = () => {
    const frame = useCurrentFrame();
    // Energetic pulse
    const pulse = interpolate(Math.sin(frame / 5), [-1, 1], [0.9, 1.3]);
    const rotate = frame * 2;

    return (
        <div style={{
            position: 'absolute',
            width: '100px',
            height: '100px',
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.8) 0%, rgba(0,0,0,0) 70%)',
            borderRadius: '50%',
            transform: `scale(${pulse})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            {/* Inner Core Geometry */}
            <div style={{
                width: '60px',
                height: '60px',
                border: '2px solid #00FF9D',
                transform: `rotate(${rotate}deg) rotateX(45deg)`,
                boxShadow: '0 0 20px #00FF9D'
            }} />
            <div style={{
                position: 'absolute',
                width: '60px',
                height: '60px',
                border: '2px solid #D4AF37',
                transform: `rotate(-${rotate}deg) rotateY(45deg)`,
                boxShadow: '0 0 20px #D4AF37'
            }} />
        </div>
    );
};

export const RemotionComposition = () => {
    return (
        <AbsoluteFill style={{
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            perspective: '1000px'
        }}>
            {/* The Oracle Eye / Core */}
            <Core />

            {/* Orbital Rings - Faster & More Layered */}
            <Ring radius={140} speed={0.8} color="rgba(0, 255, 157, 0.4)" thickness={2} dashArray={false} opacity={0.7} />
            <Ring radius={180} speed={-0.5} color="rgba(212, 175, 55, 0.3)" thickness={1} dashArray={true} opacity={0.5} />
            <Ring radius={240} speed={0.3} color="rgba(0, 255, 157, 0.2)" thickness={4} dashArray={false} opacity={0.2} />
            <Ring radius={300} speed={-0.2} color="rgba(212, 175, 55, 0.15)" thickness={1} dashArray={true} opacity={0.4} />

            {/* Floating Data Particles */}
            {Array.from({ length: 24 }).map((_, i) => (
                <DataParticle key={i} index={i} delay={0} speed={1} radius={180 + (i % 3) * 40} />
            ))}

            {/* Ambient Glow */}
            <div style={{
                position: 'absolute',
                width: '600px',
                height: '600px',
                background: 'radial-gradient(circle, rgba(5, 10, 20, 0) 20%, rgba(5, 10, 20, 0.6) 80%)',
                pointerEvents: 'none'
            }} />

        </AbsoluteFill>
    );
};

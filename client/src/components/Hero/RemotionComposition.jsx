import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, random } from 'remotion';
import dashboardScreenshot from '/dashboard-screenshot.png';

const Grid = () => {
    return (
        <AbsoluteFill
            style={{
                backgroundImage: 'linear-gradient(rgba(0, 255, 157, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 157, 0.1) 1px, transparent 1px)',
                backgroundSize: '80px 80px',
                opacity: 0.3,
                transform: 'perspective(500px) rotateX(20deg) scale(1.5)',
                transformOrigin: 'bottom'
            }}
        />
    );
};

const RadarLine = () => {
    const frame = useCurrentFrame();
    const rotate = (frame * 2) % 360;

    return (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
                width: '600px',
                height: '600px',
                borderRadius: '50%',
                border: '1px solid rgba(0, 255, 157, 0.1)',
                position: 'absolute',
            }} />
            <div style={{
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                border: '1px solid rgba(212, 175, 55, 0.1)', // Gold accent
                position: 'absolute',
            }} />
            <div style={{
                width: '800px',
                height: '2px',
                background: 'linear-gradient(90deg, rgba(0,255,157,0), rgba(0,255,157,0.8), rgba(0,255,157,0))',
                position: 'absolute',
                transform: `rotate(${rotate}deg)`,
                opacity: 0.4
            }} />
        </AbsoluteFill>
    );
};

export const RemotionComposition = () => {
    const frame = useCurrentFrame();
    const { durationInFrames, width } = useVideoConfig();

    // Cinematic Pan Effect
    const pan = interpolate(
        frame,
        [0, durationInFrames],
        [-20, -50],
        { extrapolateRight: 'clamp' }
    );

    // Subtle Zoom Out
    const scale = interpolate(
        frame,
        [0, durationInFrames],
        [1.15, 1.05],
        { extrapolateRight: 'clamp' }
    );

    // Scanning Line Position (Vertical scan)
    const scanLineY = interpolate(
        frame % 180,
        [0, 180],
        [0, 100],
        { extrapolateRight: 'loop' }
    );

    return (
        <AbsoluteFill style={{ backgroundColor: '#050c18', overflow: 'hidden' }}>
            {/* Background Dashboard Image - heavily styled */}
            <AbsoluteFill style={{ transform: `scale(${scale})` }}>
                <Img
                    src={dashboardScreenshot}
                    style={{
                        width: '120%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: `translateX(${pan}px)`,
                        opacity: 0.25, // Very dark background
                        filter: 'grayscale(60%) contrast(120%) brightness(0.8) hue-rotate(180deg)' // Techno blue look
                    }}
                />
            </AbsoluteFill>

            {/* Procedural Layers */}
            <Grid />
            <RadarLine />

            {/* Scanning Line Effect */}
            <AbsoluteFill>
                <div style={{
                    position: 'absolute',
                    top: `${scanLineY}%`,
                    left: 0,
                    width: '100%',
                    height: '4px',
                    background: 'linear-gradient(90deg, transparent, rgba(0, 255, 157, 0.6), transparent)',
                    boxShadow: '0 0 20px rgba(0, 255, 157, 0.4)',
                    opacity: 0.6
                }} />
            </AbsoluteFill>

            {/* Vignette & Cinematic Tint */}
            <AbsoluteFill
                style={{
                    background: 'radial-gradient(circle at center, transparent 30%, #050c18 90%)',
                }}
            />

            {/* Subtle Blue Tint Overlay */}
            <AbsoluteFill
                style={{
                    background: 'linear-gradient(to bottom, rgba(5, 12, 24, 0.3) 0%, rgba(5, 12, 24, 0.8) 100%)',
                    mixBlendMode: 'overlay'
                }}
            />
        </AbsoluteFill>
    );
};

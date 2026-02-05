import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import dashboardScreenshot from '/dashboard-screenshot.png';

export const RemotionComposition = () => {
    const frame = useCurrentFrame();
    const { durationInFrames, width } = useVideoConfig();

    // Cinematic Pan Effect
    // Pan from slightly left to slightly right
    const pan = interpolate(
        frame,
        [0, durationInFrames],
        [-20, -50], // Moves the image horizontally
        { extrapolateRight: 'clamp' }
    );

    // Subtle Zoom Out
    const scale = interpolate(
        frame,
        [0, durationInFrames],
        [1.1, 1.05],
        { extrapolateRight: 'clamp' }
    );

    // Analyze Overlay Opacity
    const overlayOpacity = interpolate(
        frame,
        [0, 30, durationInFrames],
        [0, 0.3, 0.1],
        { extrapolateRight: 'clamp' }
    );

    // Scanning Line Position
    const scanLineY = interpolate(
        frame % 120, // Loop every 2 seconds (assuming 60fps)
        [0, 120],
        [0, 100],
        { extrapolateRight: 'loop' }
    );

    return (
        <AbsoluteFill style={{ backgroundColor: '#0B1A2F', overflow: 'hidden' }}>
            {/* Background Dashboard Image */}
            <AbsoluteFill style={{ transform: `scale(${scale})` }}>
                <Img
                    src={dashboardScreenshot}
                    style={{
                        width: '120%', // Make it wider for panning
                        height: '100%',
                        objectFit: 'cover',
                        transform: `translateX(${pan}px)`,
                        opacity: 0.6 // Dim it slightly for text readability
                    }}
                />
            </AbsoluteFill>

            {/* High-Tech Grid Overlay */}
            <AbsoluteFill
                style={{
                    backgroundImage: 'linear-gradient(rgba(11, 26, 47, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(11, 26, 47, 0.5) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    opacity: 0.2
                }}
            />

            {/* Scanning Line Effect */}
            <AbsoluteFill>
                <div style={{
                    position: 'absolute',
                    top: `${scanLineY}%`,
                    left: 0,
                    width: '100%',
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, rgba(0, 255, 157, 0.8), transparent)',
                    boxShadow: '0 0 10px rgba(0, 255, 157, 0.5)',
                    opacity: 0.5
                }} />
            </AbsoluteFill>

            {/* Vignette for Cinematic Feel */}
            <AbsoluteFill
                style={{
                    background: 'radial-gradient(circle, transparent 60%, #0B1A2F 100%)',
                }}
            />
        </AbsoluteFill>
    );
};

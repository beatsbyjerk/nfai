import { Player } from '@remotion/player';
import { RemotionComposition } from './RemotionComposition';
import './Hero.css';

export const Hero = () => {
    const scrollToContent = () => {
        const content = document.getElementById('main-content');
        if (content) {
            content.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="hero-container">
            {/* Background Video Player */}
            <div className="hero-video-wrapper">
                <Player
                    component={RemotionComposition}
                    durationInFrames={300} // 5 seconds loop (assuming 60fps)
                    compositionWidth={1920}
                    compositionHeight={1080}
                    fps={60}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                    autoPlay
                    loop
                    muted
                    controls={false}
                />
            </div>

            {/* Content Overlay */}
            <div className="hero-overlay">
                <div className="hero-content">
                    <h1 className="hero-title">
                        <span className="text-gradient-gold">Athena</span>, a trading tool
                    </h1>
                    <p className="hero-subtitle">
                        Analyzing over <span className="highlight-green">10k transactions</span> per minute!
                    </p>

                    <button className="hero-cta" onClick={scrollToContent}>
                        Get Calls!
                    </button>
                </div>
            </div>
        </div>
    );
};

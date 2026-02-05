import { Player } from '@remotion/player';
import { RemotionComposition } from './RemotionComposition';
import './Hero.css';

const StatCard = ({ label, value, sub }) => (
    <div className="stat-card">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
    </div>
);

export const Hero = () => {
    const scrollToContent = () => {
        const content = document.getElementById('main-content');
        if (content) {
            content.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <section className="hero-section">
            <div className="hero-content-wrapper">

                {/* Left Column: Copy & Actions */}
                <div className="hero-text-col">
                    <div className="hero-badge-pill">
                        <span className="dot-indicator"></span>
                        <span>Athena Intelligence v2.0</span>
                    </div>

                    <h1 className="hero-headline">
                        Athena, a trading <br />
                        <span className="gradient-text">tool</span>
                    </h1>

                    <p className="hero-description">
                        Analyzing over <span className="highlight">10k transactions</span> per minute!
                    </p>

                    <div className="hero-actions">
                        <button className="btn-primary" onClick={scrollToContent}>
                            (Get Calls!) <span className="arrow">↓</span>
                        </button>
                        <div className="hero-trust">
                            <span className="trust-item">🛡️ Non-Custodial</span>
                            <span className="trust-item">⚡ &lt; 100ms Latency</span>
                        </div>
                    </div>

                    <div className="hero-stats-grid">
                        <StatCard label="Volume Analyzed" value="$4.2B+" sub="Last 24h" />
                        <StatCard label="Signal Accuracy" value="87%" sub="Verified On-Chain" />
                        <StatCard label="Active Nodes" value="1,240" sub="Global Network" />
                    </div>
                </div>

                {/* Right Column: The Visual (Oracle Core) */}
                <div className="hero-visual-col">
                    <div className="visual-container">
                        <Player
                            component={RemotionComposition}
                            durationInFrames={300}
                            compositionWidth={800} // Square/Portrait aspect for the column
                            compositionHeight={800}
                            fps={60}
                            style={{
                                width: '100%',
                                height: '100%',
                                backgroundColor: 'transparent'
                            }}
                            autoPlay
                            loop
                            muted
                            controls={false}
                        />
                        {/* Floating UI Elements Overlay */}
                        <div className="floating-card card-top-right">
                            <div className="card-label">Status</div>
                            <div className="card-value active">ONLINE</div>
                        </div>
                        <div className="floating-card card-bottom-left">
                            <div className="card-label">Target</div>
                            <div className="card-value font-mono">SOL/USDC</div>
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
};

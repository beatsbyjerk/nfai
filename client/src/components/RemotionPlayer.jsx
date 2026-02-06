import { Player } from '@remotion/player';
import { Video } from 'remotion';

const VideoComposition = ({ src }) => {
  return (
    <Video 
      src={src} 
      style={{ 
        width: '100%', 
        height: '100%', 
        objectFit: 'cover' 
      }} 
    />
  );
};

export const RemotionPlayer = ({ videoSrc, style, className, width = 1920, height = 1080 }) => {
  return (
    <div className={className} style={{ width: '100%', height: '100%', ...style }}>
      <Player
        component={VideoComposition}
        inputProps={{ src: videoSrc }}
        durationInFrames={30 * 60} // Default 60s loop @ 30fps
        compositionWidth={width}
        compositionHeight={height}
        fps={30}
        style={{
          width: '100%',
          height: '100%',
        }}
        controls={false}
        autoPlay
        loop
        muted
      />
    </div>
  );
};

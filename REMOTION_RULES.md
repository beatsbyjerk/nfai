# REMOTION PROMPT ENGINEERING — MASTER RULES
> Give this file to your AI editor (Claude Code, Codex, Cursor, etc.) at the start of every Remotion session.
> Last updated: February 2026

---

## WHO THIS IS FOR
You are an AI coding agent generating Remotion video components. These rules exist because generic prompts produce generic videos. The gap between "AI-generated basic" and "promotional quality" is entirely in the specificity of instructions you follow. Read all of this before writing a single line of code.

---

## SECTION 1 — BEFORE YOU WRITE ANY CODE

### 1.1 Always load Remotion Skills first
Before generating any code, load Remotion's official agent skills from:
```
https://www.remotion.dev/llms.txt
```
Remotion also supports `.md` appended to any doc URL for raw markdown. For example:
```
https://www.remotion.dev/docs/spring.md
https://www.remotion.dev/docs/interpolate.md
https://www.remotion.dev/docs/transitions.md
https://www.remotion.dev/docs/light-leaks.md
```
Read the relevant skill files BEFORE generating code. The most important ones for visual quality:
- `rules/animations.md` — fundamental animation patterns
- `rules/assets.md` — images, video, audio imports
- `rules/3d.md` — Three.js / React Three Fiber
- `rules/light-leaks.md` — `@remotion/light-leaks` package
- `rules/sequencing.md` — `<Series>`, `<TransitionSeries>`, `<Sequence>`
- `rules/fonts.md` — Google Fonts and local fonts

### 1.2 Constants-first architecture (MANDATORY)
Every component MUST begin with a constants block. Never hardcode values inline.

```tsx
// ─── CONSTANTS ────────────────────────────────────────────────────
const DURATION_FRAMES = 180;
const FPS = 30;

// Timing (in frames)
const TITLE_ENTER_FRAME = 0;
const SUBTITLE_ENTER_FRAME = 20;
const IMAGE_ENTER_FRAME = 40;
const CTA_ENTER_FRAME = 90;

// Typography
const HEADLINE_FONT = 'Syne'; // or local font
const BODY_FONT = 'Inter';
const HEADLINE_SIZE = 96;
const HEADLINE_COLOR = '#F5F5F0';

// Palette
const BG_COLOR = '#0A0A0A';
const ACCENT_COLOR = '#C8FF00';
const SURFACE_COLOR = 'rgba(255,255,255,0.04)';

// Spring config
const SPRING_SNAPPY = { damping: 200, stiffness: 300, mass: 0.8 };
const SPRING_SMOOTH = { damping: 80, stiffness: 100, mass: 1.2 };
const SPRING_ELASTIC = { damping: 60, stiffness: 180, mass: 0.6 };
// ─────────────────────────────────────────────────────────────────
```

---

## SECTION 2 — ASSETS: REAL IMAGES, VIDEO, AND BACKGROUNDS

This is where most AI-generated videos fail. They use colored divs and CSS shapes instead of real assets.

### 2.1 The public/ folder system
ALL local assets MUST be placed in `public/` and referenced with `staticFile()`:

```tsx
import { Img, staticFile } from 'remotion';

// Background image (real photo or generated image)
<Img src={staticFile('bg/office-background.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

// Product screenshot
<Img src={staticFile('product/dashboard-screenshot.png')} />

// Person / headshot
<Img src={staticFile('people/founder.png')} />
```

**NEVER** use `<img>` (lowercase). Always use `<Img>` from `remotion`. It guarantees the image is fully loaded before the frame renders, preventing blank frames in the final export.

### 2.2 Remote URLs for stock images
You can use remote URLs directly without `staticFile()` — but ensure CORS is enabled on the server:

```tsx
// Unsplash (CORS-enabled, free)
<Img src="https://images.unsplash.com/photo-[ID]?w=1920&q=80" />

// Or any CDN-hosted asset
<Img src="https://your-cdn.com/background.jpg" />
```

For stock image sources, prefer:
- **Unsplash** (`images.unsplash.com`) — direct URL, CORS-enabled
- **Pexels** (`images.pexels.com`) — CORS-enabled
- **Your own CDN** — always fastest

### 2.3 Background video (not a solid color)
Real promotional videos use actual video backgrounds, not colored divs.

```tsx
import { OffthreadVideo, staticFile, AbsoluteFill } from 'remotion';

// Background video layer
<AbsoluteFill>
  <OffthreadVideo
    src={staticFile('bg/abstract-loop.mp4')}
    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    muted
  />
</AbsoluteFill>

// Transparent video overlay (e.g. particles, fire, smoke — black background clips)
<AbsoluteFill>
  <OffthreadVideo
    src={staticFile('overlays/particles.mp4')}
    style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen' }}
    muted
  />
</AbsoluteFill>
```

The `mixBlendMode: 'screen'` trick makes black pixels invisible — this is how you layer stock motion overlay footage (particles, light leaks, glitch effects, lens flares) over any background without green screen.

### 2.4 Image sequences (for frame-by-frame animation)
If you have an exported image sequence from After Effects, Rotato, or a 3D tool:

```tsx
import { Img, staticFile, useCurrentFrame } from 'remotion';

const frame = useCurrentFrame();
const sequenceFrame = Math.min(frame, 59); // cap to available frames
<Img src={staticFile(`sequence/frame${String(sequenceFrame).padStart(4, '0')}.png`)} />
```

### 2.5 AI-generated images in prompts
When prompting the AI agent to build a video that needs images, ALWAYS tell it:
- Where to place images in `public/` (e.g., `public/bg/hero.jpg`)
- What real dimensions they should be (e.g., `1920x1080` for backgrounds, `800x800` for avatars)
- Whether they are transparent PNGs or solid JPGs
- If they should be generated: specify the exact tool (Midjourney, DALL-E, Stable Diffusion) and provide the generated URL or file path

---

## SECTION 3 — ANIMATION PHYSICS (THE REAL TECHNICAL GAP)

### 3.1 `spring()` — use it for EVERYTHING that moves

Never use `interpolate(frame, [0, 30], [0, 1])` for entrance animations. That's linear and looks robotic.

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

// Snappy entrance (UI cards, titles)
const enter = spring({ fps, frame, config: { damping: 200, stiffness: 300 } });

// Smooth, physical (images, hero elements)
const enterSmooth = spring({ fps, frame: frame - 40, config: { damping: 80, stiffness: 100 } });

// Elastic bounce (icons, badges)
const enterElastic = spring({ fps, frame: frame - 20, config: { damping: 50, stiffness: 180 } });

// Apply to transform
style={{ transform: `scale(${enter}) translateY(${(1 - enterSmooth) * 60}px)` }}
```

### 3.2 `interpolate()` — clamp ALWAYS

```tsx
import { interpolate, useCurrentFrame, Easing } from 'remotion';

const frame = useCurrentFrame();

// WRONG — no clamp
const opacity = interpolate(frame, [0, 20], [0, 1]);

// CORRECT — always clamp both sides
const opacity = interpolate(frame, [0, 20], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

// With easing (for non-spring animations)
const slideIn = interpolate(frame, [0, 30], [-200, 0], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
});
```

### 3.3 Layered motion (what makes things feel alive)

Never move an element in only one axis. Layer multiple transforms:

```tsx
const ySlide = spring({ fps, frame, config: { damping: 120 } });
const scale = spring({ fps, frame: frame - 5, config: { damping: 200 } });
const rotation = interpolate(frame, [0, 45], [8, 0], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: Easing.out(Easing.quad),
});
const opacity = interpolate(frame, [0, 15], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

style={{
  opacity,
  transform: `
    translateY(${(1 - ySlide) * 80}px)
    scale(${0.85 + scale * 0.15})
    rotate(${rotation}deg)
  `,
}}
```

### 3.4 Continuous motion (looping idle animations)

For elements that should float, pulse, or breathe after they enter:

```tsx
const idleFloat = Math.sin((frame / fps) * Math.PI * 0.8) * 6; // gentle float
const idlePulse = 1 + Math.sin((frame / fps) * Math.PI * 1.2) * 0.015; // subtle scale pulse
const idleRotate = Math.sin((frame / fps) * Math.PI * 0.4) * 1.5; // slow rock

// Combine with entrance animation
const entered = spring({ fps, frame: frame - ENTER_FRAME, config: { damping: 120 } });
style={{
  transform: `
    translateY(${(1 - entered) * 100 + idleFloat}px)
    scale(${idlePulse})
    rotate(${idleRotate}deg)
  `,
}}
```

---

## SECTION 4 — VISUAL LAYERS (HOW REAL VIDEOS ARE BUILT)

Every polished Remotion video is built in layers from back to front. Always structure your `AbsoluteFill` stack in this order:

```
Layer 0: Background (real photo, gradient, or video)
Layer 1: Background texture/noise (CSS noise, grain, scanlines)
Layer 2: Background video overlay (particles, abstract motion — mixBlendMode: screen)
Layer 3: Light leaks (@remotion/light-leaks) at scene transitions
Layer 4: Main content (images, product screenshots, UI mockups)
Layer 5: Text and typography
Layer 6: UI chrome (cards, badges, progress bars, data overlays)
Layer 7: Foreground overlays (vignette, film grain, color grade)
```

### 4.1 Noise/grain texture (CSS-based, no external asset needed)

```tsx
// Subtle film grain using SVG filter — add as topmost layer
<AbsoluteFill style={{ opacity: 0.08, pointerEvents: 'none' }}>
  <svg width="100%" height="100%">
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" />
  </svg>
</AbsoluteFill>
```

### 4.2 Vignette (CSS radial gradient as topmost layer)

```tsx
<AbsoluteFill
  style={{
    background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%)',
    pointerEvents: 'none',
  }}
/>
```

### 4.3 Color grade / mood overlay

```tsx
// Warm cinematic tone
<AbsoluteFill
  style={{
    background: 'linear-gradient(180deg, rgba(255,140,60,0.06) 0%, rgba(20,10,40,0.12) 100%)',
    mixBlendMode: 'multiply',
    pointerEvents: 'none',
  }}
/>
```

### 4.4 Light leaks at scene cuts

```tsx
import { LightLeak } from '@remotion/light-leaks';

// At a scene transition point
<LightLeak durationInFrames={20} seed={42} hueShift={180} />
```

---

## SECTION 5 — TYPOGRAPHY (NOT JUST FONT SIZE)

### 5.1 Always load a real Google Font

```tsx
import { loadFont } from '@remotion/fonts';
import { continueRender, delayRender } from 'remotion';

const handle = delayRender();
loadFont({
  family: 'Syne',
  weights: ['700', '800'],
}).then(() => continueRender(handle));
```

Top font choices for different video aesthetics:
- **Tech / SaaS**: Syne, Space Grotesk, IBM Plex Mono
- **Editorial / News**: Playfair Display, DM Serif Display
- **Clean / Modern**: Inter, Geist, Plus Jakarta Sans
- **Bold / Impact**: Bebas Neue, Black Han Sans
- **Data / Dashboard**: JetBrains Mono, Roboto Mono
- **Luxury / Brand**: Cormorant Garamond, Libre Baskerville

### 5.2 Text entrance patterns (not just fade in)

```tsx
// Reveal (characters slide up from clip)
const clipReveal = spring({ fps, frame: frame - START_FRAME, config: { damping: 120 } });
<div style={{ overflow: 'hidden', height: '1.2em' }}>
  <div style={{ transform: `translateY(${(1 - clipReveal) * 100}%)` }}>
    {headline}
  </div>
</div>

// Word-by-word stagger
{words.map((word, i) => {
  const wordEnter = spring({ fps, frame: frame - START_FRAME - i * 4, config: { damping: 160 } });
  return (
    <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - wordEnter) * 40}px)`, opacity: wordEnter, marginRight: '0.25em' }}>
      {word}
    </span>
  );
})}
```

---

## SECTION 6 — TRANSITIONS

### 6.1 Use `@remotion/transitions` — not manual crossfades

```tsx
import { TransitionSeries, springTiming, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';
import { slide } from '@remotion/transitions/slide';
import { flip } from '@remotion/transitions/flip';

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}>
    <SceneOne />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    timing={springTiming({ config: { damping: 200 } })}
    presentation={slide({ direction: 'from-right' })}
  />
  <TransitionSeries.Sequence durationInFrames={90}>
    <SceneTwo />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    timing={linearTiming({ durationInFrames: 20 })}
    presentation={fade()}
  />
  <TransitionSeries.Sequence durationInFrames={90}>
    <SceneThree />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

---

## SECTION 7 — PROMPT ENGINEERING FORMULA

When writing prompts to an AI agent, use this exact structure. Never write a one-liner.

### 7.1 The complete prompt template

```
## COMPOSITION
- Resolution: 1920x1080, 30fps
- Duration: [X] seconds = [X*30] frames
- Output: mp4

## AESTHETIC REFERENCE
[Describe the look you want by referencing real things, not style words]
- Reference: Apple keynote slides, Linear app UI, Vercel dashboard
- Color palette: #0A0A0A background, #F5F5F0 primary text, #C8FF00 accent
- Typography: Syne 800 for headlines, Inter 400 for body
- Mood: Clean, high-contrast, editorial — NOT gradient-heavy or neon

## ASSET LIST (files to place in public/)
- public/bg/hero.jpg — 1920x1080 dark abstract background (describe or provide URL)
- public/product/dashboard.png — 1440x900 screenshot of [your product]
- public/overlays/grain.mp4 — 1920x1080 film grain overlay video
- public/logo.svg — brand logo
- public/audio/background.mp3 — ambient music (if needed)

## LAYER STRUCTURE (back to front)
1. Background: <Img> of public/bg/hero.jpg, objectFit cover
2. Noise overlay: SVG feTurbulence filter, opacity 0.06
3. Video overlay: public/overlays/grain.mp4 with mixBlendMode screen, opacity 0.3
4. Main content: [describe elements]
5. Typography: [describe text layers]
6. UI chrome: [cards, badges, etc.]
7. Vignette: radial gradient top layer

## SCENE BREAKDOWN (frame-by-frame)
- Frame 0–30: [Element A] enters from [direction] using spring({ damping: 120 })
- Frame 20–50: [Element B] fades in with opacity interpolate [0,15] → [0,1] clamped
- Frame 40: [Element C] slides in from right using spring({ damping: 80 })
- Frame 60–90: [Element D] — word-by-word stagger, 4 frames apart per word
- Frame 90: TransitionSeries slide transition to Scene 2
- Frame 90–180: [Scene 2 elements]

## ANIMATION RULES
- All entrances: use spring() not interpolate for movement
- All interpolate() calls: MUST include extrapolateLeft and extrapolateRight: 'clamp'
- After entrance: add continuous idle animation (float, pulse, or subtle rotation)
- Spring configs to use:
  - Snappy UI: { damping: 200, stiffness: 300 }
  - Physical objects: { damping: 80, stiffness: 100 }
  - Elastic pop: { damping: 50, stiffness: 180 }

## TYPOGRAPHY
- Font: load Syne from @remotion/fonts before rendering
- Headline: 96px, weight 800, letterSpacing: '-0.03em', lineHeight: 1.05
- Text entrances: clip reveal (overflow hidden + translateY) — NOT fade-in
- All text: use absolute pixel positioning, not flexbox centering

## TECHNICAL REQUIREMENTS
- All assets: use <Img> from remotion (never <img>)
- Background video: use <OffthreadVideo> with muted
- Constants-first: ALL values declared as constants at top of file
- No Math.random(): use random() from remotion with static seeds
- No hardcoded frame delays inline: reference named constants
- Use @remotion/transitions for all scene-to-scene cuts
```

---

## SECTION 8 — WHAT NOT TO DO (ANTI-PATTERNS)

| ❌ Basic (what produces generic videos) | ✅ Production (what to do instead) |
|---|---|
| Solid color background `#0A0A0A` | Real photo/video background + noise texture overlay |
| Generic font (system default) | Load specific Google Font with proper weight |
| `interpolate(frame, [0,30], [0,1])` for movement | `spring()` with tuned damping/stiffness |
| `interpolate()` without clamp | Always add `extrapolateLeft/Right: 'clamp'` |
| Fade-in for all text | Clip reveal (overflow hidden + translateY) |
| All elements enter at frame 0 | Staggered timing, each element has a named entry frame |
| Single-axis movement | Layered transforms: translateY + scale + rotate together |
| No idle animation after entrance | Sine wave float/pulse applied after spring settles |
| Generic "particles" via CSS | Actual `.mp4` overlay with `mixBlendMode: 'screen'` |
| CSS box shadows for depth | Real image assets, proper z-layering, vignette overlay |
| One component for everything | Split into Scene components, use `<Series>` or `<TransitionSeries>` |
| Prompt: "make a product promo" | Full prompt with asset list, frame-by-frame breakdown, palette, physics config |

---

## SECTION 9 — QUICK REFERENCE: KEY REMOTION APIS

```tsx
// Core hooks
useCurrentFrame()           // current frame number (starts at 0)
useVideoConfig()            // { fps, durationInFrames, width, height }

// Animation
spring({ fps, frame, config: { damping, stiffness, mass } })
interpolate(value, inputRange, outputRange, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing? })
Easing.out(Easing.cubic)   // common easing functions

// Layout
<AbsoluteFill>              // positions children to fill full canvas
<Sequence from={30} durationInFrames={60}>  // shows children only during this window
<Series> / <Series.Sequence durationInFrames={60}>  // sequential scenes
<TransitionSeries>          // scenes with transitions between them

// Assets
<Img src={staticFile('path.jpg')} />         // images (NEVER <img>)
<OffthreadVideo src={staticFile('v.mp4')} muted />  // background video
<Audio src={staticFile('music.mp3')} />      // audio
staticFile('filename')      // reference public/ folder assets

// Randomness (deterministic — required for rendering)
random('seed-string')       // returns 0–1, same value every render

// Packages
@remotion/transitions        // fade, wipe, slide, flip transitions
@remotion/light-leaks        // <LightLeak> component
@remotion/fonts              // loadFont() for Google Fonts
@remotion/gif                // <Gif> for animated GIFs
```

---

## SECTION 10 — ASSET SOURCING GUIDE FOR AI AGENTS

When the prompt requires images that don't exist yet, use these sources:

### Free stock photo URLs (CORS-enabled, use directly)
```
// Unsplash — always add dimensions for performance
https://images.unsplash.com/photo-[PHOTO_ID]?w=1920&h=1080&fit=crop&q=80

// Pexels
https://images.pexels.com/photos/[PHOTO_ID]/pexels-photo-[PHOTO_ID].jpeg?w=1920
```

### AI-generated image workflow
If images need to be generated:
1. Generate via Midjourney, DALL-E, or Stable Diffusion
2. Download and place in `public/` folder
3. Reference with `staticFile('image-name.jpg')`
4. Always specify in the prompt: **"This component expects the file `public/[filename]` to exist. Add a placeholder colored div if the file is not yet present, with a TODO comment."**

### Motion overlay assets
For video overlays (particles, grain, light leaks), you can find royalty-free `.mp4` overlays at:
- Pexels Videos (free)
- Mazwai (free)
- Coverr (free)
Place in `public/overlays/` and use with `mixBlendMode: 'screen'`.

---

## SECTION 11 — RENDER QUALITY SETTINGS

When rendering, use these settings to avoid compression artifacts:

```bash
# High quality render
npx remotion render MyComp output.mp4 \
  --codec h264 \
  --crf 16 \
  --scale 1

# For social (smaller file)
npx remotion render MyComp output.mp4 \
  --codec h264 \
  --crf 23 \
  --scale 1
```

CRF scale: 0 = lossless, 18 = high quality, 23 = default, 28 = lower quality. For promotional output, stay at 16–18.

---

*End of rules. Always load this file before starting any Remotion video generation session.*

---
name: Premium Web App Design Guidelines
description: Design system, tech stack, coding practices, and styling rules for creating high-end, premium, dark-mode web applications.
---

# Premium Web App Design Guidelines

This skill provides comprehensive rules and stylistic approaches for building and maintaining high-end, professional web applications. It focuses on modern, sleek aesthetics and high-performance coding practices without tying to any specific brand identity.

## 1. Core Tech Stack
- **Framework**: Next.js (App Router) + React
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: lucide-react
- **Backend / DB (Optional but recommended)**: Supabase or similar for auth and database operations
- **Payments / E-commerce (Optional)**: Stripe API
- **Web3 (Optional)**: Web3 libraries (like Solana Wallet Adapter) when crypto integrations are required

## 2. Design System & Aesthetics
The project should use a dark, premium aesthetic with vibrant accents. If it looks standard or boring, it's incorrect.

### Colors & Theming
- **App Background**: Deep dark, almost black (e.g., `#050508`). Avoid pure `#000000` to maintain depth.
- **Text Primary**: Off-white (e.g., `#e8e8f0`) to reduce eye strain compared to pure white.
- **Accents**: Define vibrant, high-contrast accent colors relevant to the specific brand (e.g., strong reds, neon greens, or electric blues). 
- **Surface/Glass Elements**: Use semi-transparent backgrounds with blurs.
  - Light glass: `bg-white/[0.03] border border-white/5`
  - Deep glass: `bg-[var(--bg-base)]/90 backdrop-blur-xl` or `bg-[#0e0e18]`

### Typography
- **Headings**: Use a modern, distinct sans-serif or geometric font for impact (e.g., Syne, Clash Display, or Outfit). Utilize a CSS variable or `font-heading` Tailwind class.
- **Body**: Use a clean, highly legible geometric sans-serif (e.g., Plus Jakarta Sans, Inter, or Roboto).
- **Implementation**: Always use a dedicated heading utility for headers and fallback to standard sans for body text to maintain clear typographic hierarchy.

### Effects & Animations
- **Glows**: Liberally use blurred background elements for ambient glows. Example: `<div className="absolute bg-[accent-color]/20 blur-[120px] rounded-full pointer-events-none -z-10" />`
- **Glassmorphism**: Tooltips, navbars, and dropdowns should feature borders (`border-white/10`), slight background opacity (`bg-[#050508]/98`), and `backdrop-blur-*`.
- **Transitions**: Ensure interactive elements have smooth hover transitions. Add `transition-all duration-200` to hover states and implement slight transforms (e.g., `hover:-translate-y-0.5`).

## 3. SEO & Structured Data
Every main page must include its relevant JSON-LD structured data.
- **Product Schema**: Add for hardware, products, or checkout pages.
- **Organization Schema**: Add to the home page or global layout.
- Always include complete Open Graph (OG) images, twitter cards, and descriptive metadata.

## 4. Coding Practices
- **Server Components vs Client Components**: Use `"use client"` ONLY when state (e.g., `useState`), effects (`useEffect`), or browser APIs are specifically needed. Default to Server Components for better performance.
- **Semantics**: Write modular, semantic HTML5.
- **Routing**: Next.js links must use the `<Link>` component for internal routes. External links should use `<a>` tags with `target="_blank" rel="noopener noreferrer"` if opening in a new tab.

## 5. Mobile Responsiveness
- Always test styling components with `md:` prefixed Tailwind classes to ensure fluid desktop scaling. Build mobile-first.
- Use conditional rendering or specific mobile wrappers for menus and complex interactive components that degrade gracefully on smaller viewports.
- Hide complex desktop navigation behind cleanly animated hamburger toggles on smaller screens.

## 6. Implementation Checklist for High-End Components
- [ ] Maintains the premium dark aesthetic using designated hex colors and avoiding generic defaults.
- [ ] Features ambient glows or glassmorphic surfaces where depth is needed.
- [ ] Interactive elements have smooth hover transitions and clear focus states.
- [ ] Mobile navigation and layouts degrade gracefully and remain perfectly usable.
- [ ] Typography clearly separates headings from body text.
- [ ] Correctly utilizes React Server Components versus Client Components (`use client`).

// Munchkin the cat, drawn as SVG so it stays crisp at any size.
// Stage 1: one still pose. More poses arrive with the animation update.
export function catSVG({ size = "100%", label = "Munchkin the cat" } = {}) {
  return `
<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${label}">
  <g>
    <path d="M20 54 L28 14 Q30 9 34 13 L54 34 Z" fill="#9b6bff"/>
    <path d="M100 54 L92 14 Q90 9 86 13 L66 34 Z" fill="#9b6bff"/>
    <path d="M27 44 L31 22 L45 35 Z" fill="#ffb3d1"/>
    <path d="M93 44 L89 22 L75 35 Z" fill="#ffb3d1"/>
    <ellipse cx="60" cy="68" rx="46" ry="40" fill="#9b6bff"/>
    <path d="M52 32 q2 7 0 12 M60 30 q0 8 0 13 M68 32 q-2 7 0 12" stroke="#7d4ee8" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="86" rx="24" ry="17" fill="#c3a3ff"/>
    <ellipse cx="33" cy="80" rx="8" ry="4.5" fill="#ff8fbf" opacity=".65"/>
    <ellipse cx="87" cy="80" rx="8" ry="4.5" fill="#ff8fbf" opacity=".65"/>
    <ellipse cx="44" cy="64" rx="7.5" ry="9.5" fill="#2b1d44"/>
    <ellipse cx="76" cy="64" rx="7.5" ry="9.5" fill="#2b1d44"/>
    <circle cx="46.5" cy="60" r="3" fill="#fff"/>
    <circle cx="78.5" cy="60" r="3" fill="#fff"/>
    <circle cx="42" cy="68" r="1.4" fill="#fff"/>
    <circle cx="74" cy="68" r="1.4" fill="#fff"/>
    <path d="M56.5 76 h7 q1.5 0 .5 1.6 l-3 3 q-1 1-2 0 l-3-3 q-1-1.6.5-1.6z" fill="#ff6fa8"/>
    <path d="M52 84 q4 4.5 8 0 q4 4.5 8 0" stroke="#2b1d44" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M14 74 l18 3 M13 83 l19-1 M106 74 l-18 3 M107 83 l-19-1" stroke="#6b3fd9" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>
  </g>
</svg>`;
}

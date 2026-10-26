// Munchkin the cat: a chubby purple kitten with soft shading, outlines and big glossy eyes.
// Drawn as SVG so it stays crisp at any size. More poses arrive with the animation update.
let uid = 0;
export function catSVG({ size = "100%", label = "Munchkin the cat" } = {}) {
  const k = `c${uid++}`;
  const O = "#3b2163"; // outline
  return `
<svg viewBox="0 0 200 220" width="${size}" height="${size}" ${label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`}>
  <defs>
    <radialGradient id="${k}b" cx="42%" cy="35%" r="70%">
      <stop offset="0" stop-color="#c3a2ff"/><stop offset=".6" stop-color="#9a6af5"/><stop offset="1" stop-color="#7647d8"/>
    </radialGradient>
    <radialGradient id="${k}m" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#fbf6ff"/><stop offset="1" stop-color="#ddc9ff"/>
    </radialGradient>
    <radialGradient id="${k}e" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="#3a2a78"/><stop offset="1" stop-color="#160f33"/>
    </radialGradient>
    <linearGradient id="${k}i" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#f29a3c"/>
    </linearGradient>
    <linearGradient id="${k}p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff9fc6"/><stop offset="1" stop-color="#f06aa3"/>
    </linearGradient>
  </defs>
  <g stroke="${O}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">
    <!-- tail -->
    <path d="M150 182 C186 178 192 140 172 126 C166 122 160 128 165 134 C176 146 170 166 146 168 Z" fill="url(#${k}b)"/>
    <!-- body -->
    <path d="M52 168 C48 130 70 112 100 112 C130 112 152 130 148 168 C146 196 126 206 100 206 C74 206 54 196 52 168 Z" fill="url(#${k}b)"/>
    <ellipse cx="100" cy="168" rx="30" ry="30" fill="url(#${k}m)" stroke="none"/>
    <path d="M86 156 q6 5 0 10 M114 156 q-6 5 0 10 M92 178 q8 4 16 0" fill="none" stroke="#c9b0f5" stroke-width="2.4"/>
    <!-- feet -->
    <ellipse cx="74" cy="205" rx="20" ry="11" fill="#b28cff"/>
    <ellipse cx="126" cy="205" rx="20" ry="11" fill="#b28cff"/>
    <path d="M68 200 v7 M77 199 v8 M120 200 v7 M129 199 v8" fill="none" stroke="#7a52cf" stroke-width="2"/>
    <!-- arms -->
    <path d="M58 140 C46 150 46 168 58 172 C66 170 66 152 62 144 Z" fill="url(#${k}b)"/>
    <path d="M142 140 C154 150 154 168 142 172 C134 170 134 152 138 144 Z" fill="url(#${k}b)"/>
    <!-- bib -->
    <path d="M68 124 C84 138 116 138 132 124 C130 144 117 158 100 158 C83 158 70 144 68 124 Z" fill="url(#${k}p)"/>
    <path d="M100 141 c-3-4-9-2-8 3 c1 4 8 8 8 8 s7-4 8-8 c1-5-5-7-8-3z" fill="#fff" stroke="none"/>
    <!-- ears -->
    <path d="M38 70 C34 44 40 22 50 16 C60 18 76 34 84 46 Z" fill="url(#${k}b)"/>
    <path d="M162 70 C166 44 160 22 150 16 C140 18 124 34 116 46 Z" fill="url(#${k}b)"/>
    <path d="M48 56 C46 42 49 30 53 26 C59 30 68 38 72 46 Z" fill="#ffb3d3" stroke="none"/>
    <path d="M152 56 C154 42 151 30 147 26 C141 30 132 38 128 46 Z" fill="#ffb3d3" stroke="none"/>
    <!-- head -->
    <path d="M100 30 C150 30 176 58 176 88 C176 118 148 132 100 132 C52 132 24 118 24 88 C24 58 50 30 100 30 Z" fill="url(#${k}b)"/>
    <path d="M86 36 q4 10 0 18 M100 33 q0 11 0 20 M114 36 q-4 10 0 18" fill="none" stroke="#7445d4" stroke-width="3.6"/>
    <!-- muzzle -->
    <ellipse cx="100" cy="108" rx="34" ry="21" fill="url(#${k}m)" stroke="none"/>
    <!-- eyes -->
    <ellipse cx="68" cy="86" rx="20" ry="23" fill="url(#${k}i)"/>
    <ellipse cx="132" cy="86" rx="20" ry="23" fill="url(#${k}i)"/>
    <ellipse cx="69" cy="88" rx="15" ry="18" fill="url(#${k}e)" stroke="none"/>
    <ellipse cx="131" cy="88" rx="15" ry="18" fill="url(#${k}e)" stroke="none"/>
  </g>
  <circle cx="75" cy="78" r="6.5" fill="#fff"/>
  <circle cx="137" cy="78" r="6.5" fill="#fff"/>
  <circle cx="63" cy="96" r="2.8" fill="#fff" opacity=".9"/>
  <circle cx="125" cy="96" r="2.8" fill="#fff" opacity=".9"/>
  <ellipse cx="46" cy="106" rx="11" ry="6" fill="#ff8fbf" opacity=".55"/>
  <ellipse cx="154" cy="106" rx="11" ry="6" fill="#ff8fbf" opacity=".55"/>
  <path d="M94 101 h12 q3 0 1 3 l-5 5 q-2 2-4 0 l-5-5 q-2-3 1-3z" fill="#ff6fa8" stroke="${O}" stroke-width="2"/>
  <path d="M88 114 q6 6 12 0 q6 6 12 0" fill="none" stroke="${O}" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M30 100 l22 4 M28 112 l23-1 M170 100 l-22 4 M172 112 l-23-1" stroke="${O}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
</svg>`;
}

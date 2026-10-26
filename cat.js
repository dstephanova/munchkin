// Munchkin the cat: a chubby purple kitten. Big round head, pear-shaped body, huge glossy eyes,
// stubby arms, big round feet and soft shading.
// Line work: a heavy outer outline (heavier on the bottom-right shadow side), thin soft inner lines,
// and tapered strokes for stripes, brows, whiskers and toes.
// catSVG() draws the whole cat; catSVG({ head: true }) draws only the head (for chat bubbles).
let uid = 0;

const O = "#341a5c"; // outer outline
const INNER = "#5b34a6"; // soft inner lines

// A curved stroke that is thin at both ends and fat in the middle, drawn as a filled shape.
function taper(x1, y1, cx, cy, x2, y2, w, color = O, opacity = 1) {
  const pts = [], back = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * x1 + 2 * u * t * cx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * cy + t * t * y2;
    const dx = 2 * u * (cx - x1) + 2 * t * (x2 - cx);
    const dy = 2 * u * (cy - y1) + 2 * t * (y2 - cy);
    const len = Math.hypot(dx, dy) || 1;
    const half = (w / 2) * Math.pow(Math.sin(Math.PI * t), 0.7);
    const nx = (-dy / len) * half, ny = (dx / len) * half;
    pts.push(`${(x + nx).toFixed(1)} ${(y + ny).toFixed(1)}`);
    back.unshift(`${(x - nx).toFixed(1)} ${(y - ny).toFixed(1)}`);
  }
  return `<path d="M${pts.join(" L")} L${back.join(" L")} Z" fill="${color}" opacity="${opacity}"/>`;
}

export function catSVG({ size = "100%", label = "Munchkin the cat", head = false } = {}) {
  const k = `c${uid++}`;
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  const viewBox = head ? "4 -2 232 186" : "-2 -2 244 272";

  // Silhouette shapes: [path, fill]
  const bodyShapes = [
    ["M166 232 C214 232 226 186 204 166 C196 160 186 166 192 176 C204 192 196 212 164 212 Z", `url(#${k}b)`], // tail
    ["M190 178 C186 166 192 156 202 156 C214 158 216 172 206 178 C200 182 194 182 190 178 Z", `url(#${k}t)`], // tail tip
    ["M120 148 C88 148 70 172 66 206 C62 238 86 254 120 254 C154 254 178 238 174 206 C170 172 152 148 120 148 Z", `url(#${k}b)`], // body
    ["M76 180 C58 188 56 216 70 220 C84 220 86 198 82 186 Z", `url(#${k}b)`], // left arm
    ["M164 180 C182 188 184 216 170 220 C156 220 154 198 158 186 Z", `url(#${k}b)`], // right arm
    ["M64 252 C64 238 76 232 92 232 C108 232 120 240 118 252 C116 262 104 264 92 264 C76 264 64 262 64 252 Z", `url(#${k}f)`], // left foot
    ["M176 252 C176 238 164 232 148 232 C132 232 120 240 122 252 C124 262 136 264 148 264 C164 264 176 262 176 252 Z", `url(#${k}f)`], // right foot
  ];
  const headShapes = [
    ["M40 80 C32 42 40 14 56 8 C72 12 90 30 100 44 Z", `url(#${k}b)`], // left ear
    ["M200 80 C208 42 200 14 184 8 C168 12 150 30 140 44 Z", `url(#${k}b)`], // right ear
    ["M100 42 C100 24 110 14 116 24 C120 10 136 12 140 42 Z", `url(#${k}b)`], // top tuft
    ["M120 30 C172 30 206 56 210 96 L224 108 L210 114 L220 128 L204 130 C194 160 162 174 120 174 C78 174 46 160 36 130 L20 128 L30 114 L16 108 L30 96 C34 56 68 30 120 30 Z", `url(#${k}b)`], // head
  ];
  const shapes = head ? headShapes : [...bodyShapes, ...headShapes];
  const outline = (dx, dy, w) => `<g transform="translate(${dx} ${dy})" fill="${O}" stroke="${O}" stroke-width="${w}" stroke-linejoin="round">${shapes.map(([d]) => `<path d="${d}"/>`).join("")}</g>`;

  const bodyDetails = head ? "" : `
    <path d="M120 176 C98 176 86 196 86 216 C86 238 102 246 120 246 C138 246 154 238 154 216 C154 196 142 176 120 176 Z" fill="url(#${k}m)"/>
    ${taper(104, 186, 110, 190, 104, 196, 3, INNER, 0.45)}${taper(136, 186, 130, 190, 136, 196, 3, INNER, 0.45)}
    ${taper(108, 230, 120, 236, 132, 230, 3, INNER, 0.45)}
    ${taper(64, 215, 66, 212, 69, 210, 2.6, INNER)}${taper(70, 218, 72, 215, 74, 212, 2.6, INNER)}
    ${taper(176, 215, 174, 212, 171, 210, 2.6, INNER)}${taper(170, 218, 168, 215, 166, 212, 2.6, INNER)}
    ${taper(84, 252, 84, 257, 85, 263, 3, INNER)}${taper(96, 251, 96, 256, 96, 263, 3, INNER)}
    ${taper(144, 252, 144, 257, 145, 263, 3, INNER)}${taper(156, 251, 156, 256, 156, 263, 3, INNER)}
    <path d="M82 162 C102 178 138 178 158 162 C156 188 140 202 120 202 C100 202 84 188 82 162 Z" fill="url(#${k}p)" stroke="${INNER}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M120 180 c-4-5-11-2-10 3 c1 5 10 10 10 10 s9-5 10-10 c1-5-6-8-10-3z" fill="#fff"/>`;

  return `
<svg viewBox="${viewBox}" width="${size}" height="${size}" ${a11y}>
  <defs>
    <radialGradient id="${k}b" cx="38%" cy="28%" r="78%">
      <stop offset="0" stop-color="#cfb6ff"/><stop offset=".55" stop-color="#9d6ef6"/><stop offset="1" stop-color="#6a3acb"/>
    </radialGradient>
    <radialGradient id="${k}m" cx="50%" cy="30%" r="75%">
      <stop offset="0" stop-color="#fdf9ff"/><stop offset="1" stop-color="#dcc8ff"/>
    </radialGradient>
    <radialGradient id="${k}f" cx="45%" cy="30%" r="80%">
      <stop offset="0" stop-color="#dcc8ff"/><stop offset="1" stop-color="#a47cf0"/>
    </radialGradient>
    <radialGradient id="${k}t" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#f6eeff"/><stop offset="1" stop-color="#c9adff"/>
    </radialGradient>
    <radialGradient id="${k}e" cx="50%" cy="35%" r="65%">
      <stop offset="0" stop-color="#3d2c7e"/><stop offset="1" stop-color="#140c30"/>
    </radialGradient>
    <radialGradient id="${k}i" cx="50%" cy="65%" r="60%">
      <stop offset="0" stop-color="#ffe29a"/><stop offset=".6" stop-color="#ffb84d"/><stop offset="1" stop-color="#e5832b"/>
    </radialGradient>
    <linearGradient id="${k}p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffa6cb"/><stop offset="1" stop-color="#ee659f"/>
    </linearGradient>
    <radialGradient id="${k}n" cx="40%" cy="30%" r="70%">
      <stop offset="0" stop-color="#ffb3d3"/><stop offset="1" stop-color="#ea5f98"/>
    </radialGradient>
    <linearGradient id="${k}r" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffc7df"/><stop offset="1" stop-color="#f58cba"/>
    </linearGradient>
  </defs>
  ${outline(1.8, 2.4, 7)}
  ${outline(0, 0, 5)}
  <g stroke="${INNER}" stroke-width="1.8" stroke-linejoin="round">
    ${(head ? [] : bodyShapes).map(([d, f]) => `<path d="${d}" fill="${f}"/>`).join("")}
  </g>
  ${bodyDetails}
  <g stroke="${INNER}" stroke-width="1.8" stroke-linejoin="round">
    ${headShapes.map(([d, f]) => `<path d="${d}" fill="${f}"/>`).join("")}
  </g>
  <path d="M52 64 C49 44 53 28 59 22 C69 28 79 37 86 46 Z" fill="url(#${k}r)"/>
  <path d="M188 64 C191 44 187 28 181 22 C171 28 161 37 154 46 Z" fill="url(#${k}r)"/>
  ${taper(55, 46, 58, 40, 62, 36, 2.4, "#fff", 0.75)}${taper(185, 46, 182, 40, 178, 36, 2.4, "#fff", 0.75)}
  ${taper(104, 38, 109, 48, 104, 60, 5.5, "#5f30c2", 0.85)}
  ${taper(120, 34, 121, 46, 120, 58, 6, "#5f30c2", 0.85)}
  ${taper(136, 38, 131, 48, 136, 60, 5.5, "#5f30c2", 0.85)}
  <path d="M120 120 C146 120 164 132 164 148 C164 164 146 170 120 170 C94 170 76 164 76 148 C76 132 94 120 120 120 Z" fill="url(#${k}m)"/>
  <ellipse cx="83" cy="112" rx="30.5" ry="33.5" fill="${O}"/>
  <ellipse cx="159" cy="112" rx="30.5" ry="33.5" fill="${O}"/>
  <ellipse cx="82" cy="110" rx="28" ry="31" fill="url(#${k}i)"/>
  <ellipse cx="158" cy="110" rx="28" ry="31" fill="url(#${k}i)"/>
  <ellipse cx="83" cy="113" rx="21" ry="25" fill="url(#${k}e)"/>
  <ellipse cx="157" cy="113" rx="21" ry="25" fill="url(#${k}e)"/>
  <ellipse cx="93" cy="99" rx="9.5" ry="10.5" fill="#fff"/>
  <ellipse cx="167" cy="99" rx="9.5" ry="10.5" fill="#fff"/>
  <circle cx="73" cy="124" r="4.2" fill="#fff"/>
  <circle cx="147" cy="124" r="4.2" fill="#fff"/>
  ${taper(84, 132, 92, 136, 99, 130, 2.8, "#9a82ff", 0.85)}${taper(158, 132, 166, 136, 173, 130, 2.8, "#9a82ff", 0.85)}
  <path d="M100 116 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#fff" opacity=".9"/>
  ${taper(62, 72, 76, 61, 92, 66, 4.6)}${taper(178, 72, 164, 61, 148, 66, 4.6)}
  <ellipse cx="52" cy="142" rx="14" ry="8" fill="#ff8fbf" opacity=".5"/>
  <ellipse cx="188" cy="142" rx="14" ry="8" fill="#ff8fbf" opacity=".5"/>
  <path d="M111 134 h18 q4 0 1.5 4 l-7 7 q-3 3 -6 0 l-7 -7 q-2.5 -4 1.5 -4z" fill="url(#${k}n)" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="116" cy="137" rx="3" ry="1.8" fill="#fff" opacity=".85"/>
  ${taper(105, 151, 112, 160, 120, 152, 3.6)}${taper(120, 152, 128, 160, 135, 151, 3.6)}
  ${taper(20, 139, 34, 140, 50, 143, 2.8, O, 0.55)}${taper(22, 154, 36, 150, 51, 148, 2.8, O, 0.55)}
  ${taper(220, 139, 206, 140, 190, 143, 2.8, O, 0.55)}${taper(218, 154, 204, 150, 189, 148, 2.8, O, 0.55)}
</svg>`;
}

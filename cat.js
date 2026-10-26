// Munchkin the cat: a chubby purple kitten. Big round head, pear-shaped body, huge glossy eyes,
// stubby arms, big round feet, thick even outline and soft shading.
// catSVG() draws the whole cat; catSVG({ head: true }) draws only the head (for chat bubbles).
let uid = 0;
export function catSVG({ size = "100%", label = "Munchkin the cat", head = false } = {}) {
  const k = `c${uid++}`;
  const O = "#3a1f63"; // outline
  const W = 3.6;
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  const viewBox = head ? "6 0 228 182" : "0 0 240 266";

  const body = `
    <!-- tail with fluffy tip -->
    <path d="M166 232 C214 232 226 186 204 166 C196 160 186 166 192 176 C204 192 196 212 164 212 Z" fill="url(#${k}b)"/>
    <path d="M190 178 C186 166 192 156 202 156 C214 158 216 172 206 178 C200 182 194 182 190 178 Z" fill="url(#${k}t)"/>
    <!-- pear-shaped body -->
    <path d="M120 148 C88 148 70 172 66 206 C62 238 86 254 120 254 C154 254 178 238 174 206 C170 172 152 148 120 148 Z" fill="url(#${k}b)"/>
    <path d="M120 176 C98 176 86 196 86 216 C86 238 102 246 120 246 C138 246 154 238 154 216 C154 196 142 176 120 176 Z" fill="url(#${k}m)" stroke="none"/>
    <path d="M104 186 q6 4 0 9 M136 186 q-6 4 0 9 M110 230 q10 5 20 0" fill="none" stroke="#c6aaf6" stroke-width="2.4"/>
    <!-- stubby arms -->
    <path d="M76 180 C58 188 56 216 70 220 C84 220 86 198 82 186 Z" fill="url(#${k}b)"/>
    <path d="M164 180 C182 188 184 216 170 220 C156 220 154 198 158 186 Z" fill="url(#${k}b)"/>
    <path d="M64 214 l4 -3 M70 217 l3 -4" fill="none" stroke="${O}" stroke-width="2"/>
    <path d="M176 214 l-4 -3 M170 217 l-3 -4" fill="none" stroke="${O}" stroke-width="2"/>
    <!-- big round feet -->
    <path d="M64 252 C64 238 76 232 92 232 C108 232 120 240 118 252 C116 262 104 264 92 264 C76 264 64 262 64 252 Z" fill="url(#${k}f)"/>
    <path d="M176 252 C176 238 164 232 148 232 C132 232 120 240 122 252 C124 262 136 264 148 264 C164 264 176 262 176 252 Z" fill="url(#${k}f)"/>
    <path d="M84 254 v8 M96 253 v9 M144 254 v8 M156 253 v9" fill="none" stroke="#7b51d0" stroke-width="2.2"/>
    <!-- bib -->
    <path d="M82 162 C102 178 138 178 158 162 C156 188 140 202 120 202 C100 202 84 188 82 162 Z" fill="url(#${k}p)"/>
    <path d="M120 180 c-4-5-11-2-10 3 c1 5 10 10 10 10 s9-5 10-10 c1-5-6-8-10-3z" fill="#fff" stroke="none"/>`;

  return `
<svg viewBox="${viewBox}" width="${size}" height="${size}" ${a11y}>
  <defs>
    <radialGradient id="${k}b" cx="40%" cy="30%" r="75%">
      <stop offset="0" stop-color="#cbb0ff"/><stop offset=".55" stop-color="#9d6ef6"/><stop offset="1" stop-color="#6f3fd2"/>
    </radialGradient>
    <radialGradient id="${k}m" cx="50%" cy="30%" r="75%">
      <stop offset="0" stop-color="#fdf9ff"/><stop offset="1" stop-color="#dcc8ff"/>
    </radialGradient>
    <radialGradient id="${k}f" cx="50%" cy="30%" r="80%">
      <stop offset="0" stop-color="#d8c2ff"/><stop offset="1" stop-color="#a47cf0"/>
    </radialGradient>
    <radialGradient id="${k}t" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#f4ecff"/><stop offset="1" stop-color="#c9adff"/>
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
  <g stroke="${O}" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round">
    ${head ? "" : body}
    <!-- ears -->
    <path d="M40 80 C32 42 40 14 56 8 C72 12 90 30 100 44 Z" fill="url(#${k}b)"/>
    <path d="M200 80 C208 42 200 14 184 8 C168 12 150 30 140 44 Z" fill="url(#${k}b)"/>
    <path d="M52 64 C49 44 53 28 59 22 C69 28 79 37 86 46 Z" fill="url(#${k}r)" stroke="none"/>
    <path d="M188 64 C191 44 187 28 181 22 C171 28 161 37 154 46 Z" fill="url(#${k}r)" stroke="none"/>
    <path d="M56 40 l6 8 M60 32 l6 9" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>
    <path d="M184 40 l-6 8 M180 32 l-6 9" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>
    <!-- fur tuft on top -->
    <path d="M100 42 C100 24 110 14 116 24 C120 10 136 12 140 42 Z" fill="url(#${k}b)"/>
    <!-- head with cheek tufts -->
    <path d="M120 30 C172 30 206 56 210 96 L224 108 L210 114 L220 128 L204 130 C194 160 162 174 120 174 C78 174 46 160 36 130 L20 128 L30 114 L16 108 L30 96 C34 56 68 30 120 30 Z" fill="url(#${k}b)"/>
    <path d="M104 40 q4 10 0 20 M120 36 q0 12 0 22 M136 40 q-4 10 0 20" fill="none" stroke="#6b3bcf" stroke-width="4"/>
    <!-- muzzle and cheek patches -->
    <path d="M120 120 C146 120 164 132 164 148 C164 164 146 170 120 170 C94 170 76 164 76 148 C76 132 94 120 120 120 Z" fill="url(#${k}m)" stroke="none"/>
    <!-- eyes -->
    <ellipse cx="82" cy="110" rx="29" ry="32" fill="url(#${k}i)"/>
    <ellipse cx="158" cy="110" rx="29" ry="32" fill="url(#${k}i)"/>
    <ellipse cx="83" cy="113" rx="21" ry="25" fill="url(#${k}e)" stroke="none"/>
    <ellipse cx="157" cy="113" rx="21" ry="25" fill="url(#${k}e)" stroke="none"/>
    <!-- eyebrows -->
    <path d="M64 70 q12 -8 26 -3" fill="none" stroke-width="3.4"/>
    <path d="M176 70 q-12 -8 -26 -3" fill="none" stroke-width="3.4"/>
  </g>
  <!-- eye shine -->
  <ellipse cx="93" cy="99" rx="9.5" ry="10.5" fill="#fff"/>
  <ellipse cx="167" cy="99" rx="9.5" ry="10.5" fill="#fff"/>
  <circle cx="73" cy="124" r="4.2" fill="#fff"/>
  <circle cx="147" cy="124" r="4.2" fill="#fff"/>
  <path d="M83 132 q8 4 16 -2" fill="none" stroke="#8f74ff" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>
  <path d="M157 132 q8 4 16 -2" fill="none" stroke="#8f74ff" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>
  <path d="M100 116 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#fff" opacity=".9"/>
  <!-- blush -->
  <ellipse cx="52" cy="142" rx="14" ry="8" fill="#ff8fbf" opacity=".5"/>
  <ellipse cx="188" cy="142" rx="14" ry="8" fill="#ff8fbf" opacity=".5"/>
  <!-- nose and mouth -->
  <path d="M111 134 h18 q4 0 1.5 4 l-7 7 q-3 3 -6 0 l-7 -7 q-2.5 -4 1.5 -4z" fill="url(#${k}n)" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>
  <ellipse cx="116" cy="137" rx="3" ry="1.8" fill="#fff" opacity=".85"/>
  <path d="M106 152 q7 8 14 0 q7 8 14 0" fill="none" stroke="${O}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- whiskers -->
  <path d="M22 140 l26 2 M24 152 l25 -4 M218 140 l-26 2 M216 152 l-25 -4" stroke="${O}" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>
</svg>`;
}

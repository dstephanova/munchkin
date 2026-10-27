// Full-screen photo viewer: zoom (pinch, wheel, double-tap), drag when zoomed,
// swipe or arrows between photos, close with ✕, Esc, back button or a tap outside.
let box = null, img = null, counter = null, prevBtn = null, nextBtn = null;
let photos = [], index = 0;
let scale = 1, tx = 0, ty = 0;
const pointers = new Map();
let pinchStart = null, dragStart = null, swipeStart = null, lastTap = 0;

function build() {
  box = document.createElement("div");
  box.className = "viewer";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Photo viewer");
  box.innerHTML = `
    <button class="viewer-btn viewer-close" aria-label="Close">✕</button>
    <button class="viewer-btn viewer-prev" aria-label="Previous photo">‹</button>
    <button class="viewer-btn viewer-next" aria-label="Next photo">›</button>
    <div class="viewer-stage"><img alt="Meal photo" draggable="false"></div>
    <div class="viewer-count"></div>`;
  document.body.appendChild(box);
  img = box.querySelector("img");
  counter = box.querySelector(".viewer-count");
  prevBtn = box.querySelector(".viewer-prev");
  nextBtn = box.querySelector(".viewer-next");
  box.querySelector(".viewer-close").onclick = () => history.back();
  prevBtn.onclick = () => go(-1);
  nextBtn.onclick = () => go(1);
  const stage = box.querySelector(".viewer-stage");
  // Tap outside the photo closes (checked by position, since the drag code captures the pointer).
  stage.addEventListener("click", (e) => {
    if (scale !== 1) return;
    const r = img.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) setTimeout(() => { if (scale === 1 && isViewerOpen()) history.back(); }, 280);
  });
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("dblclick", (e) => toggleZoom(e.clientX, e.clientY));
  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);
}

function apply() {
  img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}
function reset() { scale = 1; tx = 0; ty = 0; apply(); }
function show() {
  img.src = photos[index];
  counter.textContent = photos.length > 1 ? `${index + 1} / ${photos.length}` : "";
  prevBtn.hidden = nextBtn.hidden = photos.length < 2;
  reset();
}
function go(step) {
  if (photos.length < 2) return;
  index = (index + step + photos.length) % photos.length;
  show();
}
function zoomAt(newScale, cx, cy) {
  newScale = Math.min(5, Math.max(1, newScale));
  const r = box.getBoundingClientRect();
  const ox = cx - r.width / 2, oy = cy - r.height / 2;
  tx = ox - ((ox - tx) * newScale) / scale;
  ty = oy - ((oy - ty) * newScale) / scale;
  scale = newScale;
  if (scale === 1) { tx = 0; ty = 0; }
  apply();
}
function toggleZoom(x, y) { scale > 1 ? reset() : zoomAt(2.5, x, y); }
function onWheel(e) {
  e.preventDefault();
  zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
}
function onDown(e) {
  e.currentTarget.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    swipeStart = dragStart = null;
  } else if (pointers.size === 1) {
    if (scale > 1) dragStart = { x: e.clientX - tx, y: e.clientY - ty };
    else swipeStart = { x: e.clientX, y: e.clientY };
    const now = Date.now();
    if (e.pointerType === "touch" && now - lastTap < 300) { toggleZoom(e.clientX, e.clientY); swipeStart = dragStart = null; }
    lastTap = now;
  }
}
function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchStart && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    zoomAt(pinchStart.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
  } else if (dragStart) {
    tx = e.clientX - dragStart.x; ty = e.clientY - dragStart.y; apply();
  }
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (swipeStart && pointers.size === 0) {
    const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 120 && Math.abs(dy) > Math.abs(dx)) history.back(); // swipe down to close
  }
  if (pointers.size === 0) { swipeStart = dragStart = null; }
}
function onKey(e) {
  if (!box || box.hidden) return;
  if (e.key === "Escape") history.back();
  else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === "ArrowRight") go(1);
}

export function isViewerOpen() { return !!box && !box.hidden; }

export function openViewer(list, start = 0) {
  photos = list.filter(Boolean);
  if (!photos.length) return;
  if (!box) build();
  index = Math.min(Math.max(0, start), photos.length - 1);
  box.hidden = false;
  document.body.style.overflow = "hidden";
  history.pushState({ viewer: true }, "");
  show();
}

function close() {
  if (!box) return;
  box.hidden = true;
  img.removeAttribute("src");
  document.body.style.overflow = "";
}

// The back button closes the viewer first (registered before the app's own back handling).
window.addEventListener("popstate", (e) => {
  if (isViewerOpen()) { close(); e.stopImmediatePropagation(); }
});
document.addEventListener("keydown", onKey);

const COUNTS = { boy: 4, girl: 3, joker: 2 };
const CLEAR_THRESHOLD = 0.6;
const BRUSH_RADIUS = 18;

const PRIZES = {
  boy: {
    label: "MENINO",
    icon: '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" fill="#2E7FC4" stroke="#0B3D66" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>',
  },
  girl: {
    label: "MENINA",
    icon: '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" fill="#D63A7A" stroke="#7A1240" stroke-width="1.5" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  },
  joker: {
    label: "OBA, BEBÊ!",
    icon: '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#6B4A00" stroke-width="2" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>',
  },
};

const grid = document.getElementById("grid");
const slotTemplate = document.getElementById("slot-template");
const scratchedEl = document.getElementById("scratched");
const girlCountEl = document.getElementById("girl-count");
const boyCountEl = document.getElementById("boy-count");
const statusPlaying = document.getElementById("status-playing");
const statusWon = document.getElementById("status-won");
const confettiCanvas = document.getElementById("confetti");

let slots = [];
let tally = { scratched: 0, boy: 0, girl: 0 };
let confettiFrame = null;

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function setup() {
  stopConfetti();
  grid.innerHTML = "";
  tally = { scratched: 0, boy: 0, girl: 0 };
  updateStats();
  statusPlaying.classList.remove("hidden");
  statusWon.classList.add("hidden");

  const types = shuffle(
    Object.entries(COUNTS).flatMap(([type, n]) => Array(n).fill(type))
  );
  slots = types.map((type) => createSlot(type));
}

function createSlot(type) {
  const el = slotTemplate.content.firstElementChild.cloneNode(true);
  const prize = el.querySelector(".prize");
  prize.classList.add(type);
  prize.innerHTML = `${PRIZES[type].icon}<span>${PRIZES[type].label}</span>`;
  grid.appendChild(el);

  const slot = { type, el, done: false };
  slot.reveal = () => {
    if (slot.done) return;
    slot.done = true;
    el.classList.add("done");
    onSlotRevealed(type);
  };
  initScratch(el.querySelector("canvas"), slot);
  return slot;
}

function drawFoil(ctx, w, h) {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#DDE0E7");
  gradient.addColorStop(0.5, "#B7BCC8");
  gradient.addColorStop(1, "#DDE0E7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  for (let y = 5; y < h; y += 10) {
    for (let x = 5; x < w; x += 10) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(w * 0.36)}px Fredoka, sans-serif`;
  ctx.fillStyle = "#8A8F9C";
  ctx.fillText("?", w / 2, h * 0.42 + 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("?", w / 2, h * 0.42);

  ctx.font = `800 ${Math.max(9, Math.round(w * 0.1))}px Nunito, sans-serif`;
  ctx.fillStyle = "#4A4F5C";
  ctx.letterSpacing = "1px";
  ctx.fillText("RASPE", w / 2, h * 0.74);
}

function initScratch(canvas, slot) {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.scale(dpr, dpr);
  drawFoil(ctx, width, height);

  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = BRUSH_RADIUS * 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let drawing = false;
  let last = null;

  // Map pointer position to the canvas' drawing size, even if the layout resized
  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * width) / r.width,
      y: ((e.clientY - r.top) * height) / r.height,
    };
  };

  const scratch = (from, to) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  };

  const clearedRatio = () => {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let sampled = 0;
    for (let i = 3; i < data.length; i += 16) {
      sampled++;
      if (data[i] < 128) clear++;
    }
    return clear / sampled;
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (slot.done) return;
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    last = getPos(e);
    scratch(last, last);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing || slot.done) return;
    const pos = getPos(e);
    scratch(last, pos);
    last = pos;
  });

  const stop = () => {
    if (!drawing) return;
    drawing = false;
    if (clearedRatio() >= CLEAR_THRESHOLD) slot.reveal();
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

function onSlotRevealed(type) {
  tally.scratched++;
  if (type === "boy") tally.boy++;
  if (type === "girl") tally.girl++;
  updateStats();

  if (tally.scratched === slots.length) {
    setTimeout(() => {
      statusPlaying.classList.add("hidden");
      statusWon.classList.remove("hidden");
      launchConfetti();
    }, 600);
  }
}

function updateStats() {
  scratchedEl.textContent = tally.scratched;
  girlCountEl.textContent = tally.girl;
  boyCountEl.textContent = tally.boy;
}

function launchConfetti() {
  const ctx = confettiCanvas.getContext("2d");
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;

  const colors = ["#2E7FC4", "#7CC4FF", "#BFE2FF", "#2269A8", "#FFD25E", "#FFFFFF"];
  const particles = Array.from({ length: 180 }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: Math.random() * -confettiCanvas.height,
    w: 6 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    vx: -1 + Math.random() * 2,
    vy: 2 + Math.random() * 3,
    rot: Math.random() * 360,
    vr: -5 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const endTime = performance.now() + 6000;

  const frame = (now) => {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > confettiCanvas.height && now < endTime) {
        p.y = -20;
        p.x = Math.random() * confettiCanvas.width;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (particles.some((p) => p.y <= confettiCanvas.height)) {
      confettiFrame = requestAnimationFrame(frame);
    } else {
      stopConfetti();
    }
  };

  confettiFrame = requestAnimationFrame(frame);
}

function stopConfetti() {
  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  confettiFrame = null;
  confettiCanvas.getContext("2d").clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

document.getElementById("reveal-all").addEventListener("click", () => {
  slots.forEach((slot) => slot.reveal());
});
document.getElementById("restart").addEventListener("click", setup);

// Wait for the fonts so the "?" and "RASPE" on the foil use the right typeface
Promise.all([
  document.fonts.load("700 34px Fredoka"),
  document.fonts.load("800 10px Nunito"),
])
  .catch(() => {})
  .then(setup);

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import LanyardBadge from '@/components/LanyardBadge.vue';
import { CASES, MEDIA } from '@/data/cases';

type Mode = 'hero' | 'case';

interface Pose {
  s: number;
  x: number;
  y: number;
}

const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';
const EASE_IN = 'cubic-bezier(.5,0,.75,0)';
const EASE_GLIDE = 'cubic-bezier(.65,0,.35,1)';

const mode = ref<Mode>('hero');
const isCasePose = ref(false);
const isMobile = ref(false);
const isGliding = ref(false);
const currentIndex = ref(0);

const pre = reactive({
  tags: [true, true, true, true],
  wm: true,
  script: true,
  badge: true,
  hint: true,
});

// Template refs
const stageRef = ref<HTMLElement | null>(null);
const frameRef = ref<HTMLElement | null>(null);
const plateRef = ref<HTMLImageElement | null>(null);
const cutRef = ref<HTMLImageElement | null>(null);
const casePlateRef = ref<HTMLImageElement | null>(null);
const transRef = ref<HTMLVideoElement | null>(null);
const screenRef = ref<HTMLElement | null>(null);
const flashRef = ref<HTMLElement | null>(null);
const deskWmRef = ref<SVGSVGElement | null>(null);
const deskScriptRef = ref<HTMLElement | null>(null);
const deskBadgeRef = ref<InstanceType<typeof LanyardBadge> | null>(null);

const mobWmRef = ref<SVGSVGElement | null>(null);
const mobScriptRef = ref<HTMLElement | null>(null);
const mobBadgeBoxRef = ref<HTMLElement | null>(null);
const mobBadgeRef = ref<InstanceType<typeof LanyardBadge> | null>(null);

const tag1Ref = ref<HTMLElement | null>(null);
const tag2Ref = ref<HTMLElement | null>(null);
const tag3Ref = ref<HTMLElement | null>(null);
const tag4Ref = ref<HTMLElement | null>(null);
const hintRef = ref<HTMLElement | null>(null);

const ticketRef = ref<HTMLElement | null>(null);
const descRef = ref<HTMLElement | null>(null);
const caseVideoRefs = ref<(HTMLVideoElement | null)[]>([]);

const activeCase = computed(() => CASES[currentIndex.value]);
const caseCounter = computed(
  () => `${String(currentIndex.value + 1).padStart(2, '0')} / ${String(CASES.length).padStart(2, '0')}`
);

// Runtime state
let busy = false;
let transReady = false;
let transBlobUrl: string | null = null;
let lastWheel = 0;
let touchStartX = 0;
let touchStartY = 0;
let transRaf = 0;
let swayAnims: Animation[] = [];
let heroOutAnims: Animation[] = [];
let failsafeTimer: number | null = null;

const rmQuery = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const isReducedMotion = () => Boolean(rmQuery?.matches);
const dur = (ms: number) => (isReducedMotion() ? 0 : ms);

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setBusy(v: boolean) {
  busy = v;
  document.body.classList.toggle('busy', v);
}

function setCaseBodyClass(v: boolean) {
  document.body.classList.toggle('is-case', v);
}

function getBadgeEls(): HTMLElement[] {
  const list: HTMLElement[] = [];
  if (deskBadgeRef.value?.el) list.push(deskBadgeRef.value.el);
  if (mobBadgeRef.value?.el) list.push(mobBadgeRef.value.el);
  return list;
}

function getWmEls(): Element[] {
  const list: Element[] = [];
  if (deskWmRef.value) list.push(deskWmRef.value);
  if (mobWmRef.value) list.push(mobWmRef.value);
  return list;
}

function getScriptEls(): HTMLElement[] {
  const list: HTMLElement[] = [];
  if (deskScriptRef.value) list.push(deskScriptRef.value);
  if (mobScriptRef.value) list.push(mobScriptRef.value);
  return list;
}

function getTagEls(): HTMLElement[] {
  return [tag1Ref.value, tag2Ref.value, tag3Ref.value, tag4Ref.value].filter(
    (el): el is HTMLElement => Boolean(el)
  );
}

function getDescChildren(): HTMLElement[] {
  if (!descRef.value) return [];
  return Array.from(descRef.value.children) as HTMLElement[];
}

function setCaseVideoRef(el: unknown, index: number) {
  caseVideoRefs.value[index] = (el as HTMLVideoElement | null) ?? null;
}

// Section 7: Frame fitting & pose computation
function computePose(targetMode: Mode): Pose {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const mobile = W <= 820;

  if (!mobile) {
    const cover = Math.max(W / 1440, H / 810);
    const u = Math.min(W / 1440, H / 900);

    if (targetMode === 'hero') {
      const s = cover;
      return { s, x: (W - 1440 * s) / 2, y: 0 };
    }

    const top = 66 * u;
    const fit = (H - top - 28 * u) / (762 - 79);
    let s: number;
    let y: number;
    if (fit >= cover) {
      s = cover;
      y = Math.min(0, Math.max(H - 810 * s, top - 79 * s));
    } else {
      s = fit;
      y = top - 79 * fit;
    }
    return { s, x: (W - 1440 * s) / 2, y };
  }

  // Mobile / tablet (<= 820px)
  if (targetMode === 'hero') {
    const s = Math.min(W / 650, (0.62 * H) / 810);
    return { s, x: W / 2 - 805 * s, y: H - 790 * s };
  }

  const navH = 0.022 * H + 42 + 22;
  const ticketH = ticketRef.value?.offsetHeight || 160;
  const descH = descRef.value?.offsetHeight || 60;
  const uiBottom = 62 + ticketH + 18 + Math.max(60, descH) + 14;
  const s = Math.min((W - 28) / 905, Math.max(0.2, (H - navH - uiBottom) / (762 - 95)));
  return { s, x: W / 2 - 720 * s, y: H - navH - 762 * s };
}

function fitHero(p: Pose) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (W <= 820) return;

  const wmEl = deskWmRef.value;
  const badgeEl = deskBadgeRef.value?.el;
  const scriptEl = deskScriptRef.value;
  if (!wmEl || !badgeEl || !scriptEl) return;

  const vl = Math.max(0, -p.x / p.s);
  const vr = Math.min(1440, (W - p.x) / p.s);
  const pad = 18 / p.s;

  wmEl.style.left = `${vl + 0.6 * pad}px`;
  wmEl.style.width = `${vr - vl - 1.2 * pad}px`;

  badgeEl.style.left = `${Math.min(986, vr - pad - 417)}px`;
  const vb = Math.min(810, (H - p.y) / p.s);
  badgeEl.style.top = `${Math.min(-165, vb - 56 / p.s - 935)}px`;

  scriptEl.style.left = `${vl + pad + 70}px`;
}

function place(targetMode: Mode) {
  const W = window.innerWidth;
  isMobile.value = W <= 820;

  if (isMobile.value) {
    const mbWidth = mobBadgeBoxRef.value?.offsetWidth || W * 0.27;
    const th = ticketRef.value?.offsetHeight || 160;
    document.documentElement.style.setProperty('--mbs', String(mbWidth / 582));
    document.documentElement.style.setProperty('--th', `${th}px`);
  }

  const p = computePose(targetMode);
  if (frameRef.value) {
    frameRef.value.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.s})`;
  }
  isCasePose.value = targetMode === 'case';

  if (targetMode === 'hero' && !isMobile.value) {
    fitHero(p);
  }
}

// Badge sway & hover swing (§8)
function stopSway() {
  swayAnims.forEach((a) => a.cancel());
  swayAnims = [];
}

function startSway() {
  stopSway();
  if (isReducedMotion()) return;
  for (const el of getBadgeEls()) {
    const anim = el.animate(
      [{ transform: 'rotate(-1.1deg)' }, { transform: 'rotate(1.1deg)' }],
      {
        duration: 3200,
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out',
      }
    );
    swayAnims.push(anim);
  }
}

function onBadgeSwing() {
  if (mode.value !== 'hero' || busy || isReducedMotion()) return;
  for (const el of getBadgeEls()) {
    el.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-6deg)' },
        { transform: 'rotate(4deg)' },
        { transform: 'rotate(-2deg)' },
        { transform: 'rotate(0deg)' },
      ],
      {
        duration: 1400,
        easing: 'ease-out',
        composite: 'add',
      }
    );
  }
}

// Entrance choreography (§8)
function revealPreImmediately() {
  pre.tags = [false, false, false, false];
  pre.wm = false;
  pre.script = false;
  pre.badge = false;
  pre.hint = false;
  const all = [
    ...getTagEls(),
    ...getWmEls(),
    ...getScriptEls(),
    ...getBadgeEls(),
    ...(hintRef.value ? [hintRef.value] : []),
  ];
  all.forEach((el) => el.classList.remove('pre'));
}

function runEntrance() {
  if (document.documentElement.dataset.in === '1') return;
  document.documentElement.dataset.in = '1';

  place('hero');

  if (isReducedMotion()) {
    revealPreImmediately();
    return;
  }

  // 4 nav tags
  getTagEls().forEach((el, i) => {
    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateY(-40px) rotate(-4deg)' },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: 700,
        delay: 120 + i * 80,
        easing: 'cubic-bezier(.3,1.5,.5,1)',
        fill: 'both',
      }
    );
    anim.onfinish = () => {
      el.classList.remove('pre');
      pre.tags[i] = false;
      anim.cancel();
    };
  });

  // Wordmark (desktop + mobile)
  getWmEls().forEach((el) => {
    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateY(60px)', clipPath: 'inset(100% 0 0 0)' },
        { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' },
      ],
      {
        duration: 1100,
        delay: 260,
        easing: EASE_OUT,
        fill: 'both',
      }
    );
    anim.onfinish = () => {
      el.classList.remove('pre');
      pre.wm = false;
      anim.cancel();
    };
  });

  // Script (desktop + mobile)
  getScriptEls().forEach((el) => {
    const anim = el.animate(
      [
        { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)' },
      ],
      {
        duration: 900,
        delay: 1050,
        easing: 'cubic-bezier(.5,0,.3,1)',
        fill: 'both',
      }
    );
    anim.onfinish = () => {
      el.classList.remove('pre');
      pre.script = false;
      anim.cancel();
    };
  });

  // Badge (desktop + mobile)
  const badges = getBadgeEls();
  let badgesFinished = 0;
  badges.forEach((el) => {
    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateY(-120%) rotate(8deg)', offset: 0 },
        { opacity: 1, transform: 'translateY(0) rotate(-3deg)', offset: 0.6 },
        { opacity: 1, transform: 'translateY(0) rotate(1.6deg)', offset: 0.8 },
        { opacity: 1, transform: 'translateY(0) rotate(0deg)', offset: 1 },
      ],
      {
        duration: 1500,
        delay: 700,
        easing: EASE_OUT,
        fill: 'both',
      }
    );
    anim.onfinish = () => {
      el.classList.remove('pre');
      pre.badge = false;
      anim.cancel();
      badgesFinished += 1;
      if (badgesFinished === badges.length && mode.value === 'hero' && !busy) {
        startSway();
      }
    };
  });

  // Hint
  if (hintRef.value) {
    const hintEl = hintRef.value;
    const anim = hintEl.animate(
      [{ opacity: 0 }, { opacity: 0.85 }],
      {
        duration: 600,
        delay: 1800,
        easing: EASE_OUT,
        fill: 'both',
      }
    );
    anim.onfinish = () => {
      hintEl.classList.remove('pre');
      pre.hint = false;
      anim.cancel();
    };
  }
}

// Hero out & hero in helpers (§9 & §12)
function clearHeroOutAnims() {
  heroOutAnims.forEach((a) => a.cancel());
  heroOutAnims = [];
}

function heroOut() {
  clearHeroOutAnims();
  stopSway();
  const d = dur(380);

  for (const el of getWmEls()) {
    heroOutAnims.push(
      el.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-40px)' },
        ],
        { duration: d, easing: EASE_IN, fill: 'forwards' }
      )
    );
  }

  for (const el of getScriptEls()) {
    heroOutAnims.push(
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: d,
        easing: EASE_IN,
        fill: 'forwards',
      })
    );
  }

  for (const el of getBadgeEls()) {
    heroOutAnims.push(
      el.animate(
        [
          { opacity: 1, transform: 'rotate(0deg)' },
          { opacity: 0, transform: 'translateY(-110%) rotate(-6deg)' },
        ],
        { duration: d, easing: EASE_IN, fill: 'forwards' }
      )
    );
  }
}

function heroIn() {
  clearHeroOutAnims();
  revealPreImmediately();

  if (isReducedMotion()) return;

  for (const el of getWmEls()) {
    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateY(40px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 700, easing: EASE_OUT, fill: 'both' }
    );
    anim.onfinish = () => anim.cancel();
  }

  for (const el of getScriptEls()) {
    const anim = el.animate(
      [
        { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)' },
      ],
      { duration: 700, delay: 250, easing: EASE_OUT, fill: 'both' }
    );
    anim.onfinish = () => anim.cancel();
  }

  const badges = getBadgeEls();
  let done = 0;
  for (const el of badges) {
    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateY(-110%) rotate(6deg)', offset: 0 },
        { opacity: 1, transform: 'translateY(0) rotate(-2deg)', offset: 0.7 },
        { opacity: 1, transform: 'translateY(0) rotate(0deg)', offset: 1 },
      ],
      { duration: 1100, easing: EASE_OUT, fill: 'both' }
    );
    anim.onfinish = () => {
      anim.cancel();
      done += 1;
      if (done === badges.length && mode.value === 'hero') {
        startSway();
      }
    };
  }
}

// Case screen video management (§10 & §11)
function preloadCase(idx: number) {
  const vid = caseVideoRefs.value[idx];
  if (!vid) return;
  if (vid.preload !== 'auto') {
    vid.preload = 'auto';
    if (vid.readyState === 0) {
      vid.load();
    }
  }
}

function playOnly(idx: number) {
  caseVideoRefs.value.forEach((vid, i) => {
    if (!vid) return;
    if (i === idx) {
      vid.currentTime = 0;
      const p = vid.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      vid.pause();
    }
  });
}

function pauseAllCaseVideos() {
  caseVideoRefs.value.forEach((vid) => vid?.pause());
}

function flashScreen(peak: number, ms: number) {
  if (!flashRef.value || isReducedMotion()) return;
  flashRef.value.getAnimations().forEach((a) => a.cancel());
  flashRef.value.animate(
    [{ opacity: 0 }, { opacity: peak, offset: 0.25 }, { opacity: 0 }],
    { duration: ms, easing: 'ease-out' }
  );
}

// Ticket & description enter / leave (§10 & §11)
async function caseIn(idx: number, first: boolean) {
  currentIndex.value = idx;
  await nextTick();

  if (isMobile.value) {
    const th = ticketRef.value?.offsetHeight || 160;
    document.documentElement.style.setProperty('--th', `${th}px`);
    place('case');
  }

  const ticketEl = ticketRef.value;
  const descKids = getDescChildren();

  if (isReducedMotion()) {
    if (ticketEl) {
      ticketEl.getAnimations().forEach((a) => a.cancel());
      ticketEl.style.opacity = '1';
      ticketEl.style.transform = 'none';
    }
    descKids.forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  if (ticketEl) {
    ticketEl.getAnimations().forEach((a) => a.cancel());
    ticketEl.animate(
      [
        { opacity: 0, transform: 'translateY(-60px) rotate(-6deg)', offset: 0 },
        { opacity: 1, transform: 'translateY(6px) rotate(1.2deg)', offset: 0.7 },
        { opacity: 1, transform: 'none', offset: 1 },
      ],
      {
        duration: 800,
        delay: first ? 150 : 0,
        easing: EASE_OUT,
        fill: 'both',
      }
    );
  }

  descKids.forEach((el, k) => {
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: 600,
        delay: (first ? 250 : 80) + k * 70,
        easing: EASE_OUT,
        fill: 'both',
      }
    );
  });
}

function caseOut(): Promise<void> {
  const ticketEl = ticketRef.value;
  const descKids = getDescChildren();

  if (isReducedMotion()) {
    if (ticketEl) {
      ticketEl.getAnimations().forEach((a) => a.cancel());
      ticketEl.style.opacity = '0';
    }
    descKids.forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = '0';
    });
    return Promise.resolve();
  }

  const anims: Promise<unknown>[] = [];

  if (ticketEl) {
    ticketEl.getAnimations().forEach((a) => a.cancel());
    const a = ticketEl.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-40px) rotate(4deg)' },
      ],
      { duration: 380, easing: EASE_IN, fill: 'forwards' }
    );
    anims.push(a.finished.catch(() => {}));
  }

  descKids.forEach((el, k) => {
    el.getAnimations().forEach((a) => a.cancel());
    const a = el.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-10px)' },
      ],
      { duration: 300, delay: k * 40, easing: EASE_IN, fill: 'forwards' }
    );
    anims.push(a.finished.catch(() => {}));
  });

  return Promise.all(anims).then(() => {});
}

// Section 9: Hero -> Laptop Dive
function playTransitionClip(): Promise<void> {
  return new Promise((resolve) => {
    const trans = transRef.value;
    if (!trans) {
      resolve();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(transRaf);
      trans.removeEventListener('ended', finish);
      trans.pause();
      resolve();
    };

    trans.addEventListener('ended', finish, { once: true });

    const safety = window.setTimeout(finish, 3600);
    const wrappedFinish = () => {
      window.clearTimeout(safety);
      finish();
    };

    const tick = () => {
      if (finished) return;
      const d = trans.duration;
      const p = d && Number.isFinite(d) && d > 0 ? trans.currentTime / d : 0;
      if (trans.ended || p >= 0.995) {
        wrappedFinish();
        return;
      }
      trans.playbackRate = Math.max(1.2, 1.8 + 2.4 * Math.sin(Math.PI * Math.min(p * 1.08, 1)));
      transRaf = requestAnimationFrame(tick);
    };

    trans.playbackRate = 1.8;
    const playPromise = trans.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => wrappedFinish());
    }
    transRaf = requestAnimationFrame(tick);
  });
}

async function arriveCase() {
  mode.value = 'case';
  setCaseBodyClass(true);

  if (plateRef.value) plateRef.value.style.visibility = 'hidden';
  if (cutRef.value) {
    cutRef.value.getAnimations().forEach((a) => a.cancel());
    cutRef.value.style.opacity = '0';
  }
  if (screenRef.value) {
    screenRef.value.getAnimations().forEach((a) => a.cancel());
    screenRef.value.style.opacity = '1';
  }

  flashScreen(0.55, 600);

  // Reset all case videos then reveal video 0
  caseVideoRefs.value.forEach((v, idx) => {
    if (!v) return;
    v.getAnimations().forEach((a) => a.cancel());
    v.style.opacity = idx === 0 ? '1' : '0';
  });

  const firstVid = caseVideoRefs.value[0];
  if (firstVid && !isReducedMotion()) {
    const a = firstVid.animate(
      [
        { opacity: 0, transform: 'scale(1.06)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 700, easing: EASE_OUT, fill: 'both' }
    );
    a.onfinish = () => {
      firstVid.style.opacity = '1';
      a.cancel();
    };
  }

  playOnly(0);
  await caseIn(0, true);
  preloadCase(1);

  await wait(dur(700));
  isGliding.value = false;
  setBusy(false);
}

async function toCase() {
  if (busy || mode.value === 'case') return;
  setBusy(true);

  // Ensure case 0 content is measured for mobile placement before dive
  currentIndex.value = 0;
  await nextTick();

  // 1. heroOut
  heroOut();
  await wait(dur(330));

  const trans = transRef.value;
  const plate = plateRef.value;
  const cut = cutRef.value;
  const casePlate = casePlateRef.value;

  // 2. Fallback when reduced motion or transition clip not ready
  if (isReducedMotion() || !transReady || !trans) {
    isGliding.value = false;
    place('case');
    if (casePlate) {
      casePlate.getAnimations().forEach((a) => a.cancel());
      if (isReducedMotion()) {
        casePlate.style.opacity = '1';
      } else {
        const a = casePlate.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 500,
          easing: EASE_OUT,
          fill: 'forwards',
        });
        await a.finished.catch(() => {});
        casePlate.style.opacity = '1';
        a.cancel();
      }
    }
    if (plate) plate.style.visibility = 'hidden';
    if (cut) cut.style.opacity = '0';
    await arriveCase();
    return;
  }

  // 3. Hand-off to transition video & glide camera
  trans.currentTime = 0;
  trans.style.opacity = '1';

  await nextFrame();
  await nextFrame();

  if (plate) plate.style.visibility = 'hidden';

  if (cut) {
    cut.getAnimations().forEach((a) => a.cancel());
    const cutFade = cut.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 260,
      easing: 'ease-out',
      fill: 'forwards',
    });
    cutFade.onfinish = () => {
      cut.style.opacity = '0';
      cutFade.cancel();
    };
  }

  document.documentElement.style.setProperty('--glide', '1.6s');
  isGliding.value = true;
  await nextTick();
  place('case');

  // 4. Play transition clip with eased speed curve (~1.72s)
  await playTransitionClip();

  // 5. Seamless frame swap to crisp caseplate
  if (casePlate) {
    casePlate.getAnimations().forEach((a) => a.cancel());
    casePlate.style.filter = 'none';
    casePlate.style.opacity = '1';
  }
  trans.style.opacity = '0';

  await arriveCase();
}

// Section 11: Switch cases in place
async function swapTo(nextIdx: number) {
  if (busy || mode.value !== 'case') return;
  setBusy(true);

  const prevIdx = currentIndex.value;
  const oldVid = caseVideoRefs.value[prevIdx];
  const newVid = caseVideoRefs.value[nextIdx];

  // 1. Out in parallel: ticket + desc + old video
  const oldFadePromise =
    oldVid && !isReducedMotion()
      ? oldVid
          .animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 350,
            easing: 'ease-out',
            fill: 'forwards',
          })
          .finished.catch(() => {})
      : Promise.resolve();

  await Promise.all([caseOut(), oldFadePromise]);

  // 2. Pause old video
  if (oldVid) {
    oldVid.pause();
    oldVid.getAnimations().forEach((a) => a.cancel());
    oldVid.style.opacity = '0';
  }

  // 3. Flash
  flashScreen(0.35, 420);

  // 4. Reveal new video
  if (newVid) {
    newVid.getAnimations().forEach((a) => a.cancel());
    newVid.style.opacity = '1';
    if (!isReducedMotion()) {
      const a = newVid.animate(
        [
          { opacity: 0, transform: 'scale(1.04)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 500, easing: EASE_OUT, fill: 'both' }
      );
      a.onfinish = () => {
        newVid.style.opacity = '1';
        a.cancel();
      };
    }
  }

  // 5. Play new video, animate ticket/desc in, preload next
  playOnly(nextIdx);
  await caseIn(nextIdx, false);
  preloadCase((nextIdx + 1) % CASES.length);

  // 6. Release busy
  await wait(dur(520));
  setBusy(false);
}

// Section 12: Back to Hero
async function toHero() {
  if (busy || mode.value === 'hero') return;
  setBusy(true);

  // 1. caseOut + pause videos + fade screen out
  const screenEl = screenRef.value;
  const screenFade =
    screenEl && !isReducedMotion()
      ? screenEl
          .animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 300,
            easing: 'ease-out',
            fill: 'forwards',
          })
          .finished.catch(() => {})
      : Promise.resolve();

  pauseAllCaseVideos();
  const outPromise = caseOut();

  // 2. Remove is-case, glide camera back to hero
  mode.value = 'hero';
  setCaseBodyClass(false);

  document.documentElement.style.setProperty('--glide', '0.9s');
  isGliding.value = !isReducedMotion();
  await nextTick();
  place('hero');

  // 3. Unhide plate & fade cutout back in
  const plate = plateRef.value;
  const cut = cutRef.value;
  const casePlate = casePlateRef.value;

  if (plate) plate.style.visibility = 'visible';

  if (cut) {
    cut.getAnimations().forEach((a) => a.cancel());
    if (isReducedMotion()) {
      cut.style.opacity = '1';
    } else {
      const cutIn = cut.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 700,
        delay: 150,
        easing: EASE_OUT,
        fill: 'both',
      });
      cutIn.onfinish = () => {
        cut.style.opacity = '1';
        cutIn.cancel();
      };
    }
  }

  // 4. Blurred zoom-out reveal between caseplate & plate
  if (casePlate) {
    casePlate.getAnimations().forEach((a) => a.cancel());
    if (isReducedMotion()) {
      casePlate.style.opacity = '0';
      casePlate.style.filter = 'none';
    } else {
      const cpOut = casePlate.animate(
        [
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: 'blur(12px)' },
        ],
        { duration: 800, easing: EASE_GLIDE, fill: 'forwards' }
      );
      cpOut.onfinish = () => {
        casePlate.style.opacity = '0';
        casePlate.style.filter = 'none';
        cpOut.cancel();
      };
    }
  }

  if (plate && !isReducedMotion()) {
    plate.getAnimations().forEach((a) => a.cancel());
    const plZoom = plate.animate(
      [
        { transform: 'scale(1.12)', filter: 'blur(8px)' },
        { transform: 'scale(1)', filter: 'blur(0px)' },
      ],
      { duration: 900, easing: EASE_OUT, fill: 'both' }
    );
    plZoom.onfinish = () => plZoom.cancel();
  }

  // Clean up screen opacity after fade finishes
  screenFade.then(() => {
    if (screenEl) {
      screenEl.getAnimations().forEach((a) => a.cancel());
      screenEl.style.opacity = '0';
    }
    caseVideoRefs.value.forEach((v) => {
      if (!v) return;
      v.getAnimations().forEach((a) => a.cancel());
      v.style.opacity = '0';
    });
  });

  // 5. After 250ms, run heroIn
  await wait(dur(250));
  heroIn();

  // 6. Release busy after 1000ms total (750ms remaining)
  await Promise.all([outPromise, wait(dur(750))]);
  if (transRef.value && transReady) {
    transRef.value.currentTime = 0;
  }
  isGliding.value = false;
  setBusy(false);
}

// Navigation actions
function onPortfolioClick() {
  if (mode.value === 'hero') toCase();
}

function onStudioClick() {
  if (mode.value === 'case') toHero();
}

function onNextCase() {
  if (mode.value !== 'case') return;
  swapTo((currentIndex.value + 1) % CASES.length);
}

function onPrevCase() {
  if (mode.value !== 'case') return;
  if (currentIndex.value === 0) {
    toHero();
  } else {
    swapTo(currentIndex.value - 1);
  }
}

// Input handlers: wheel, touch, keyboard, resize
function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (busy) return;
  if (Math.abs(e.deltaY) < 18) return;
  const now = Date.now();
  if (now - lastWheel < 900) return;
  lastWheel = now;

  if (mode.value === 'hero') {
    if (e.deltaY > 0) toCase();
  } else {
    if (e.deltaY > 0) onNextCase();
    else onPrevCase();
  }
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault();
}

function onTouchEnd(e: TouchEvent) {
  if (busy || e.changedTouches.length !== 1) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < 40) return;

  if (mode.value === 'hero') {
    if (dy <= -40 && absY >= absX) {
      toCase();
    }
  } else {
    if (absX > absY) {
      if (dx <= -40) onNextCase();
      else if (dx >= 40) onPrevCase();
    } else {
      if (dy <= -40) onNextCase();
      else if (dy >= 40) onPrevCase();
    }
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (busy) return;
  const k = e.key;
  const isNextKey = k === 'ArrowDown' || k === 'PageDown' || k === ' ';
  const isRightKey = k === 'ArrowRight';
  const isPrevKey = k === 'ArrowUp' || k === 'PageUp' || k === 'ArrowLeft';

  if (mode.value === 'hero') {
    if (isNextKey) {
      e.preventDefault();
      toCase();
    }
  } else {
    if (isNextKey || isRightKey) {
      e.preventDefault();
      onNextCase();
    } else if (isPrevKey) {
      e.preventDefault();
      onPrevCase();
    }
  }
}

function onResize() {
  isGliding.value = false;
  place(mode.value);
}

// Fetch transition clip whole into Blob for instant stall-free playback (§9)
async function loadTransitionBlob() {
  const trans = transRef.value;
  if (!trans) return;

  const markReady = () => {
    transReady = true;
  };
  trans.addEventListener('loadeddata', markReady, { once: true });

  try {
    const res = await fetch(MEDIA.trans);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    transBlobUrl = URL.createObjectURL(blob);
    trans.src = transBlobUrl;
    trans.load();
  } catch {
    trans.src = MEDIA.trans;
    trans.load();
  }
}

onMounted(() => {
  place('hero');

  // Load transition video blob in background
  loadTransitionBlob();

  // Wait for fonts + plate image, capped at 2.5s, plus 4s failsafe (§8)
  const plateReady = new Promise<void>((resolve) => {
    const img = plateRef.value;
    if (!img || img.complete) {
      resolve();
      return;
    }
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });

  const fontsReady = document.fonts ? document.fonts.ready.then(() => {}) : Promise.resolve();

  Promise.race([Promise.all([fontsReady, plateReady]), wait(2500)]).then(() => {
    requestAnimationFrame(() => runEntrance());
  });

  failsafeTimer = window.setTimeout(() => {
    requestAnimationFrame(() => runEntrance());
  }, 4000);

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  if (failsafeTimer !== null) window.clearTimeout(failsafeTimer);
  cancelAnimationFrame(transRaf);
  stopSway();
  clearHeroOutAnims();
  if (transBlobUrl) URL.revokeObjectURL(transBlobUrl);

  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('touchstart', onTouchStart);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', onTouchEnd);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', onResize);
  document.body.classList.remove('is-case', 'busy');
});
</script>

<template>
  <div ref="stageRef" class="stage" :class="{ 'm-case': isCasePose }">
    <!-- 1440 x 810 Scene Frame -->
    <div
      ref="frameRef"
      class="frame"
      :class="[isMobile ? 'm-fade' : 'd-fade', { 'm-case': isCasePose, glide: isGliding }]"
    >
      <!-- Hero studio photo plate -->
      <img
        ref="plateRef"
        class="plate"
        :src="MEDIA.plate"
        alt="Haldoren standing in green studio holding retro phone and silver laptop"
        draggable="false"
      />

      <!-- Giant white wordmark behind the cutout (z 3) -->
      <svg
        ref="deskWmRef"
        class="wm"
        :class="{ pre: pre.wm }"
        viewBox="0 0 1440 260"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wmGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity="1" />
            <stop offset="0.5" stop-color="#f1f5f3" stop-opacity="0.9" />
            <stop offset="1" stop-color="#d7e6de" stop-opacity="0.28" />
          </linearGradient>
        </defs>
        <text
          x="14"
          y="214"
          textLength="1412"
          lengthAdjust="spacingAndGlyphs"
          fill="url(#wmGrad)"
        >
          HALDOREN
        </text>
      </svg>

      <!-- Man cutout above wordmark (z 4) -->
      <img
        ref="cutRef"
        class="cut"
        :src="MEDIA.cut"
        alt=""
        aria-hidden="true"
        draggable="false"
      />

      <!-- Lanyard badge (z 5) -->
      <LanyardBadge ref="deskBadgeRef" :class="{ pre: pre.badge }" @swing="onBadgeSwing" />

      <!-- Handwritten script (z 6) -->
      <div ref="deskScriptRef" class="script" :class="{ pre: pre.script }" aria-hidden="true">
        motion-design
      </div>

      <!-- Camera dive transition video (z 6) -->
      <video
        ref="transRef"
        class="trans"
        muted
        playsinline
        preload="auto"
      />

      <!-- Static high-res laptop case plate (z 7) -->
      <img
        ref="casePlateRef"
        class="caseplate"
        :src="MEDIA.casePlate"
        alt="Silver laptop centered facing camera"
        draggable="false"
      />

      <!-- Laptop display screen (z 8) -->
      <div ref="screenRef" class="screen">
        <video
          v-for="(item, idx) in CASES"
          :key="item.id"
          :ref="(el) => setCaseVideoRef(el, idx)"
          :src="item.video"
          muted
          loop
          playsinline
          :preload="idx === 0 ? 'auto' : 'none'"
        />
        <div ref="flashRef" class="flash" />
      </div>

      <!-- Interactive screen hit area (z 9) -->
      <button
        type="button"
        class="screen-hit"
        aria-label="Next portfolio case"
        @click="onNextCase"
      />
    </div>

    <!-- Viewport-pinned UI layer (z 20) -->
    <div class="ui">
      <!-- Navigation tags -->
      <button
        ref="tag1Ref"
        type="button"
        class="tag t1"
        :class="{ pre: pre.tags[0] }"
        @click="onStudioClick"
      >
        my studio
      </button>
      <button
        ref="tag2Ref"
        type="button"
        class="tag t2"
        :class="{ pre: pre.tags[1] }"
        @click="onPortfolioClick"
      >
        portfolio
      </button>
      <a
        ref="tag3Ref"
        href="#contacts"
        class="tag t3"
        :class="{ pre: pre.tags[2] }"
        @click.prevent
      >
        contacts
      </a>
      <a
        ref="tag4Ref"
        href="#discuss"
        class="tag t4"
        :class="{ pre: pre.tags[3] }"
        @click.prevent
      >
        discuss a project
      </a>

      <!-- Centre logo (case mode on desktop) -->
      <button
        type="button"
        class="logo"
        aria-label="Return to Haldoren studio hero"
        @click="onStudioClick"
      >
        HALDOREN
      </button>

      <!-- Mobile-only fixed hero copies -->
      <svg
        ref="mobWmRef"
        class="m-wm m-only"
        :class="{ pre: pre.wm }"
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="mWmGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity="1" />
            <stop offset="0.5" stop-color="#f1f5f3" stop-opacity="0.9" />
            <stop offset="1" stop-color="#d7e6de" stop-opacity="0.3" />
          </linearGradient>
        </defs>
        <text
          x="10"
          y="210"
          textLength="1420"
          lengthAdjust="spacingAndGlyphs"
          fill="url(#mWmGrad)"
        >
          HALDOREN
        </text>
      </svg>

      <div
        ref="mobScriptRef"
        class="m-script m-only"
        :class="{ pre: pre.script }"
        aria-hidden="true"
      >
        motion-design
      </div>

      <div ref="mobBadgeBoxRef" class="m-badge m-only">
        <LanyardBadge ref="mobBadgeRef" :class="{ pre: pre.badge }" @swing="onBadgeSwing" />
      </div>

      <!-- Case punched ticket card -->
      <aside ref="ticketRef" class="ticket" aria-label="Case details">
        <span class="hole h-tl" aria-hidden="true" />
        <span class="hole h-tr" aria-hidden="true" />
        <span class="hole h-bl" aria-hidden="true" />
        <span class="hole h-br" aria-hidden="true" />
        <h2>{{ activeCase.title }}</h2>
        <div class="rows">
          <div v-for="(row, rIdx) in activeCase.rows" :key="rIdx" class="t-row">
            {{ row }}
          </div>
        </div>
      </aside>

      <!-- Case description -->
      <div ref="descRef" class="desc">
        <div class="k">{{ activeCase.key }}</div>
        <p>{{ activeCase.text }}</p>
        <div class="num">{{ caseCounter }}</div>
      </div>

      <!-- Prev / Next Case buttons -->
      <button
        type="button"
        class="nav-case prev"
        :class="{ dim: currentIndex === 0 }"
        @click="onPrevCase"
      >
        <span class="c" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </span>
        <span class="lbl">previous <br />case</span>
      </button>

      <button type="button" class="nav-case next" @click="onNextCase">
        <span class="c" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
        <span class="lbl">next <br />case</span>
      </button>

      <!-- Scroll hint -->
      <div ref="hintRef" class="hint" :class="{ pre: pre.hint }" aria-hidden="true">
        <span class="line"><span class="bead" /></span>
        <span>scroll into the work</span>
      </div>
    </div>
  </div>
</template>

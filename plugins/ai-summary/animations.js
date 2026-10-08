const LAYER_Z = 2147483000;
const SPARK = "#ffd23f";
const WATER = "#4aa3ff";
const DUST = "#9aa0a6";

const HAMMER_SVG =
  '<svg viewBox="0 0 40 16" width="100%" height="100%" preserveAspectRatio="none">' +
  '<rect x="12" y="6" width="28" height="4" rx="2" fill="#a86f3c"/>' +
  '<rect x="0" y="0" width="13" height="16" rx="2" fill="#8b949e"/>' +
  '<rect x="0" y="0" width="13" height="4" rx="1.5" fill="#c3cad1"/>' +
  "</svg>";

const DROP_SVG =
  '<svg viewBox="0 0 12 16" width="100%" height="100%">' +
  `<path d="M6 0C6 0 0 7 0 10.5A6 6 0 0 0 12 10.5C12 7 6 0 6 0Z" fill="${WATER}"/>` +
  '<ellipse cx="4" cy="10.5" rx="1.3" ry="2" fill="#fff" opacity="0.6"/>' +
  "</svg>";

const GLOVE_SVG =
  '<svg viewBox="0 0 24 20" width="100%" height="100%">' +
  '<path d="M6 2H15A8 8 0 0 1 15 18H6A2 2 0 0 1 4 16V4A2 2 0 0 1 6 2Z" fill="#e53935"/>' +
  '<ellipse cx="13" cy="14.5" rx="5" ry="2.4" fill="#b71c1c"/>' +
  '<rect x="0" y="4" width="5" height="12" rx="1" fill="#f5f5f5"/>' +
  "</svg>";

const SPRING_SVG =
  '<svg viewBox="0 0 40 10" width="100%" height="100%" preserveAspectRatio="none">' +
  '<polyline points="0,5 3,0 7,10 11,0 15,10 19,0 23,10 27,0 31,10 35,0 40,5" fill="none" stroke="#9aa0a6" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' +
  "</svg>";

const CLOUD_SVG =
  '<svg viewBox="0 0 32 18" width="100%" height="100%"><g fill="#6b7280">' +
  '<circle cx="9" cy="11" r="6"/><circle cx="16" cy="8" r="8"/><circle cx="24" cy="11" r="6"/>' +
  '<rect x="6" y="11" width="21" height="6" rx="3"/></g></svg>';

const BOLT_SVG =
  '<svg viewBox="0 0 10 30" width="100%" height="100%" preserveAspectRatio="none">' +
  `<polygon points="6,0 0,16 4.5,16 2,30 10,11 5.5,11 8,0" fill="${SPARK}" stroke="#fff" stroke-width="0.6"/>` +
  "</svg>";

const ANVIL_SVG =
  '<svg viewBox="0 0 40 24" width="100%" height="100%">' +
  '<path d="M0 2Q9 2 13 1H39V8H31Q28 8 28 11V15Q28 18 34 19V23H8V19Q14 18 14 15V11Q14 8 10 8Q4 8 0 2Z" fill="#3f444b"/>' +
  '<rect x="13" y="1" width="26" height="2" fill="#8a929c"/>' +
  "</svg>";

const GLYPHS = ["0", "1", "a", "#", "*", "{", "}", ";", "?", "&"];

const state = new WeakMap();
let bag = [];

const reducedMotion = () =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const rand = (min, max) => min + Math.random() * (max - min);

const glow = (brightness, gray, blur) =>
  `brightness(${brightness}) grayscale(${gray}) drop-shadow(0 0 ${blur}px ${SPARK})`;

const BASE_FILTER = glow(1, 0, 0);

const reset = (robot) => {
  const st = state.get(robot);
  if (st) {
    for (const a of st.anims) a.cancel();
    for (const n of st.nodes) n.remove();
  }
  const next = { anims: [], nodes: [] };
  state.set(robot, next);
  return next;
};

const measure = (robot) => {
  const r = robot.getBoundingClientRect();
  const x = r.left + window.scrollX;
  const y = r.top + window.scrollY;
  const u = Math.max(r.height, 12);
  return { u, left: x, cx: x + r.width / 2, top: y, bottom: y + r.height };
};

const play = (st, el, frames, opts) => {
  const anim = el.animate(frames, opts);
  st.anims.push(anim);
  return anim;
};

const spawn = (st, html, css) => {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:absolute;pointer-events:none;z-index:${LAYER_Z};${css}`;
  el.innerHTML = html;
  document.body.appendChild(el);
  st.nodes.push(el);
  return el;
};

const playProp = (st, el, frames, opts) => {
  const anim = play(st, el, frames, opts);
  anim.finished.then(() => el.remove(), () => {});
  return anim;
};

const burst = (st, x, y, opts) => {
  const {
    count,
    colors,
    dist,
    size,
    delay = 0,
    duration = 450,
    from = 0,
    to = 360,
    fall = 0,
    line = false,
  } = opts;
  for (let i = 0; i < count; i++) {
    const deg = from + ((to - from) * (i + rand(0.2, 0.8))) / count;
    const rad = (deg * Math.PI) / 180;
    const d = dist * rand(0.7, 1.2);
    const dx = Math.cos(rad) * d;
    const dy = Math.sin(rad) * d;
    const h = line ? Math.max(1.5, size * 0.3) : size;
    const color = colors[i % colors.length];
    const el = spawn(
      st,
      "",
      `left:${x - size / 2}px;top:${y - h / 2}px;width:${size}px;height:${h}px;` +
        `border-radius:${line ? "1px" : "50%"};background:${color};opacity:0`,
    );
    const turn = line ? `rotate(${deg}deg)` : "";
    playProp(
      st,
      el,
      [
        { opacity: 1, transform: `translate(0px, 0px) ${turn} scale(1)` },
        { opacity: 1, offset: 0.55, transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) ${turn} scale(1)` },
        { opacity: 0, transform: `translate(${dx}px, ${dy + fall}px) ${turn} scale(0.4)` },
      ],
      { duration, delay, easing: "cubic-bezier(.2,.7,.4,1)" },
    );
  }
};

const shake = (st, robot, delay) => {
  const box = robot.closest(".glance-ai");
  if (!box) return;
  play(
    st,
    box,
    [
      { transform: "translate(0, 0)" },
      { transform: "translate(-3px, 2px)" },
      { transform: "translate(3px, -1px)" },
      { transform: "translate(-2px, 1px)" },
      { transform: "translate(1px, 0)" },
      { transform: "translate(0, 0)" },
    ],
    { duration: 260, delay, easing: "linear" },
  );
};

const hammer = (robot, st) => {
  const { u, cx, top } = measure(robot);
  const duration = 780;
  const w = u * 2.6;
  const h = (w * 16) / 40;
  const head = (w * 13) / 40;
  const sink = u * 0.72;
  const el = spawn(
    st,
    HAMMER_SVG,
    `left:${cx - head / 2}px;top:${top - h}px;width:${w}px;height:${h}px;` +
      "transform-origin:100% 50%;opacity:0",
  );
  playProp(
    st,
    el,
    [
      { offset: 0, opacity: 0, transform: "translateY(0px) rotate(75deg)" },
      { offset: 0.14, opacity: 1, transform: "translateY(0px) rotate(70deg)", easing: "ease-out" },
      { offset: 0.36, opacity: 1, transform: "translateY(0px) rotate(100deg)", easing: "cubic-bezier(.6,0,1,.6)" },
      { offset: 0.5, opacity: 1, transform: "translateY(0px) rotate(0deg)" },
      { offset: 0.56, opacity: 1, transform: `translateY(${sink}px) rotate(-3deg)` },
      { offset: 0.78, opacity: 1, transform: `translateY(${sink}px) rotate(-3deg)`, easing: "ease-in" },
      { offset: 1, opacity: 0, transform: "translateY(0px) rotate(45deg)" },
    ],
    { duration },
  );
  play(
    st,
    robot,
    [
      { offset: 0, transform: "scale(1, 1)" },
      { offset: 0.5, transform: "scale(1, 1)" },
      { offset: 0.56, transform: "scale(1.6, 0.22)" },
      { offset: 0.66, transform: "scale(1.35, 0.34)" },
      { offset: 0.76, transform: "scale(1.45, 0.28)" },
      { offset: 1, transform: "scale(1.42, 0.3)" },
    ],
    { duration, fill: "forwards" },
  );
  burst(st, cx, top + sink, {
    count: 6,
    colors: [SPARK, "#fff"],
    dist: u * 1.3,
    size: u * 0.32,
    delay: duration * 0.53,
    from: 180,
    to: 360,
  });
};

const water = (robot, st) => {
  const { u, cx, top } = measure(robot);
  const duration = 1500;
  const at = (o) => duration * o;
  const w = u * 0.7;
  const h = (w * 16) / 12;
  const drop = spawn(
    st,
    DROP_SVG,
    `left:${cx - w / 2}px;top:${top - h}px;width:${w}px;height:${h}px;transform-origin:50% 100%;opacity:0`,
  );
  playProp(
    st,
    drop,
    [
      { offset: 0, opacity: 0, transform: `translateY(${-u * 5}px) scale(1, 1)` },
      { offset: 0.06, opacity: 1, transform: `translateY(${-u * 4.6}px) scale(0.9, 1.1)`, easing: "cubic-bezier(.5,0,1,1)" },
      { offset: 0.28, opacity: 1, transform: "translateY(0px) scale(0.9, 1.15)" },
      { offset: 0.33, opacity: 0.8, transform: `translateY(${u * 0.1}px) scale(1.7, 0.3)` },
      { offset: 0.4, opacity: 0, transform: `translateY(${u * 0.1}px) scale(2.2, 0.1)` },
      { offset: 1, opacity: 0, transform: `translateY(${u * 0.1}px) scale(2.2, 0.1)` },
    ],
    { duration },
  );
  burst(st, cx, top, {
    count: 7,
    colors: [WATER, "#9fd0ff"],
    dist: u * 1.1,
    size: u * 0.22,
    delay: at(0.29),
    duration: 520,
    from: 200,
    to: 340,
    fall: u * 1.2,
  });
  for (const [o, n] of [[0.34, 6], [0.44, 5], [0.6, 7]]) {
    burst(st, cx, top + u * 0.4, {
      count: n,
      colors: [SPARK, "#fff", SPARK],
      dist: u * 1.4,
      size: u * 0.55,
      delay: at(o),
      duration: 280,
      line: true,
    });
  }
  for (const [o, dx] of [[0.8, -0.2], [0.88, 0.25]]) {
    const s = u * 0.6;
    const smoke = spawn(
      st,
      "",
      `left:${cx - s / 2 + dx * u}px;top:${top - s / 2}px;width:${s}px;height:${s}px;border-radius:50%;background:${DUST};opacity:0`,
    );
    playProp(
      st,
      smoke,
      [
        { opacity: 0.7, transform: "translate(0px, 0px) scale(0.5)" },
        { opacity: 0, transform: `translate(${dx * u}px, ${-u * 1.8}px) scale(1.7)` },
      ],
      { duration: 900, delay: at(o), easing: "ease-out" },
    );
  }
  const slump = "translate(0px, 0px) rotate(-24deg) scale(0.92, 0.72)";
  play(
    st,
    robot,
    [
      { offset: 0, transform: "translate(0px, 0px) rotate(0deg) scale(1, 1)", filter: BASE_FILTER },
      { offset: 0.28, transform: "translate(0px, 0px) rotate(0deg) scale(1, 1)", filter: BASE_FILTER },
      { offset: 0.31, transform: "translate(0px, 1px) rotate(0deg) scale(1.05, 0.92)", filter: BASE_FILTER },
      { offset: 0.34, transform: "translate(-1px, 0px) rotate(0deg) scale(1, 1)", filter: glow(2.2, 0, 3) },
      { offset: 0.38, transform: "translate(1px, -1px) rotate(0deg) scale(1, 1)", filter: BASE_FILTER },
      { offset: 0.44, transform: "translate(-1px, 1px) rotate(0deg) scale(1, 1)", filter: glow(2.2, 0, 3) },
      { offset: 0.48, transform: "translate(1px, 0px) rotate(0deg) scale(1, 1)", filter: glow(1, 0.3, 0) },
      { offset: 0.6, transform: "translate(-1px, 0px) rotate(-4deg) scale(1, 1)", filter: glow(2, 0.3, 4) },
      { offset: 0.64, transform: "translate(1px, 0px) rotate(3deg) scale(1, 1)", filter: glow(0.9, 0.6, 0) },
      { offset: 0.78, transform: "translate(0px, 0px) rotate(-30deg) scale(0.92, 0.7)", filter: glow(0.65, 1, 0), easing: "ease-out" },
      { offset: 0.86, transform: "translate(0px, 0px) rotate(-20deg) scale(0.92, 0.74)", filter: glow(0.65, 1, 0) },
      { offset: 1, transform: slump, filter: glow(0.65, 1, 0) },
    ],
    { duration, fill: "forwards" },
  );
};

const anvil = (robot, st) => {
  const { u, cx, top, bottom } = measure(robot);
  const duration = 1150;
  const at = (o) => duration * o;
  const w = u * 2.1;
  const h = (w * 24) / 40;
  const sink = u * 0.6;
  const rest = u * 0.45;
  const el = spawn(
    st,
    ANVIL_SVG,
    `left:${cx - w / 2}px;top:${top - h}px;width:${w}px;height:${h}px;transform-origin:50% 100%;opacity:0`,
  );
  playProp(
    st,
    el,
    [
      { offset: 0, opacity: 0, transform: `translateY(${-u * 10}px) scale(1, 1)` },
      { offset: 0.02, opacity: 1, transform: `translateY(${-u * 9.8}px) scale(1, 1)`, easing: "cubic-bezier(.55,0,1,.45)" },
      { offset: 0.36, opacity: 1, transform: "translateY(0px) scale(1, 1)" },
      { offset: 0.4, opacity: 1, transform: `translateY(${sink}px) scale(1.08, 0.9)`, easing: "ease-out" },
      { offset: 0.48, opacity: 1, transform: `translateY(${u * 0.05}px) scale(0.98, 1.03)`, easing: "ease-in" },
      { offset: 0.56, opacity: 1, transform: `translateY(${u * 0.5}px) scale(1.03, 0.97)` },
      { offset: 0.8, opacity: 1, transform: `translateY(${rest}px) scale(1, 1)`, easing: "ease-in" },
      { offset: 1, opacity: 0, transform: `translateY(${rest}px) scale(1, 1)` },
    ],
    { duration },
  );
  play(
    st,
    robot,
    [
      { offset: 0, transform: "rotate(0deg) skewX(0deg) scale(1, 1)" },
      { offset: 0.36, transform: "rotate(0deg) skewX(0deg) scale(1, 1)" },
      { offset: 0.4, transform: "rotate(-4deg) skewX(10deg) scale(1.45, 0.4)" },
      { offset: 0.48, transform: "rotate(2deg) skewX(-4deg) scale(1.2, 0.62)" },
      { offset: 0.56, transform: "rotate(-5deg) skewX(8deg) scale(1.35, 0.5)" },
      { offset: 1, transform: "rotate(-6deg) skewX(8deg) scale(1.3, 0.55)" },
    ],
    { duration, fill: "forwards" },
  );
  burst(st, cx - u * 0.6, bottom - u * 0.1, {
    count: 4,
    colors: [DUST],
    dist: u * 1.6,
    size: u * 0.5,
    delay: at(0.38),
    duration: 600,
    from: 160,
    to: 200,
  });
  burst(st, cx + u * 0.6, bottom - u * 0.1, {
    count: 4,
    colors: [DUST],
    dist: u * 1.6,
    size: u * 0.5,
    delay: at(0.38),
    duration: 600,
    from: -20,
    to: 20,
  });
  shake(st, robot, at(0.38));
};

const glove = (robot, st) => {
  const { u, left, cx, top } = measure(robot);
  const duration = 1400;
  const at = (o) => duration * o;
  const gw = u * 1.3;
  const gh = u * 1.1;
  const reach = u * 3;
  const tucked = reach * 0.95;
  const midY = top + u / 2;
  const spring = spawn(
    st,
    SPRING_SVG,
    `left:${left - gw - reach}px;top:${midY - u * 0.3}px;width:${reach}px;height:${u * 0.6}px;transform-origin:0 50%;opacity:0`,
  );
  const fist = spawn(
    st,
    GLOVE_SVG,
    `left:${left - gw}px;top:${midY - gh / 2}px;width:${gw}px;height:${gh}px;opacity:0`,
  );
  const pose = (o, d, opacity, easing) => ({
    fist: { offset: o, opacity, transform: `translateX(${-d}px)`, ...(easing && { easing }) },
    spring: { offset: o, opacity, transform: `scaleX(${Math.max(0.02, (reach - d) / reach)})`, ...(easing && { easing }) },
  });
  const poses = [
    pose(0, tucked, 0),
    pose(0.06, tucked, 1, "cubic-bezier(.7,0,1,.6)"),
    pose(0.22, 0, 1),
    pose(0.26, u * 0.1, 1),
    pose(0.4, u * 0.1, 1, "ease-in"),
    pose(0.55, tucked, 1),
    pose(0.6, tucked, 0),
    pose(1, tucked, 0),
  ];
  playProp(st, fist, poses.map((p) => p.fist), { duration });
  playProp(st, spring, poses.map((p) => p.spring), { duration });
  const lift = -u * 0.5;
  play(
    st,
    robot,
    [
      { offset: 0, transform: "translate(0px, 0px) rotate(0deg) scale(1, 1)" },
      { offset: 0.22, transform: "translate(0px, 0px) rotate(0deg) scale(1, 1)" },
      { offset: 0.24, transform: `translate(${u * 0.1}px, 0px) rotate(0deg) scale(0.8, 1.05)` },
      { offset: 0.32, transform: `translate(${u * 0.55}px, ${-u * 0.25}px) rotate(25deg) scale(1, 1)` },
      { offset: 0.36, transform: `translate(${u * 0.6}px, ${-u * 0.1}px) rotate(15deg) scale(0.8, 1.05)`, easing: "ease-out" },
      { offset: 0.5, transform: `translate(${-u * 0.1}px, ${-u * 0.6}px) rotate(-50deg) scale(1, 1)`, easing: "ease-in" },
      { offset: 0.6, transform: `translate(0px, ${lift}px) rotate(-100deg) scale(1, 1)` },
      { offset: 0.68, transform: `translate(0px, ${lift}px) rotate(-84deg) scale(1, 1)` },
      { offset: 0.76, transform: `translate(0px, ${lift}px) rotate(-93deg) scale(1, 1)` },
      { offset: 1, transform: `translate(0px, ${lift}px) rotate(-90deg) scale(1, 1)` },
    ],
    { duration, fill: "forwards" },
  );
  burst(st, left, midY, {
    count: 5,
    colors: [SPARK, "#fff"],
    dist: u * 1.1,
    size: u * 0.45,
    delay: at(0.22),
    duration: 300,
    from: -70,
    to: 70,
    line: true,
  });
  const ox = cx - u * 0.5;
  const oy = top - u * 0.2;
  const rx = u * 0.7;
  const ry = u * 0.22;
  const orbit = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { transform: `translate(${Math.cos(a) * rx}px, ${Math.sin(a) * ry}px) scale(${0.75 + 0.25 * Math.sin(a)})` };
  });
  for (let i = 0; i < 3; i++) {
    const s = u * 0.45;
    const star = spawn(
      st,
      "\u2605",
      `left:${ox - s / 2}px;top:${oy - s / 2}px;width:${s}px;height:${s}px;font:${s}px/1 sans-serif;color:${SPARK};text-align:center`,
    );
    star.style.opacity = "0";
    playProp(st, star, orbit, { duration: 700, delay: at(0.6), iterations: 3, iterationStart: i / 3 });
    playProp(st, star, [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], {
      duration: 2100,
      delay: at(0.6),
    });
  }
};

const LIGHT = (b, inv, blur) => `brightness(${b}) invert(${inv}) drop-shadow(0 0 ${blur}px ${SPARK})`;

const lightning = (robot, st) => {
  const box = robot.closest(".glance-ai");
  const { u, cx, top } = measure(robot);
  const duration = 1600;
  const at = (o) => duration * o;
  const cw = u * 2.2;
  const ch = (cw * 18) / 32;
  const cloudTop = top - u * 3.1;
  const cloud = spawn(
    st,
    CLOUD_SVG,
    `left:${cx - cw / 2}px;top:${cloudTop}px;width:${cw}px;height:${ch}px;opacity:0`,
  );
  playProp(
    st,
    cloud,
    [
      { offset: 0, opacity: 0, transform: `translate(${-u}px, ${-u * 0.3}px)`, filter: "brightness(1)" },
      { offset: 0.14, opacity: 1, transform: "translate(0px, 0px)", filter: "brightness(1)" },
      { offset: 0.2, opacity: 1, transform: "translate(-1px, 0px)", filter: "brightness(0.8)" },
      { offset: 0.24, opacity: 1, transform: "translate(1px, 0px)", filter: "brightness(0.7)" },
      { offset: 0.3, opacity: 1, transform: "translate(0px, 0px)", filter: "brightness(0.6)" },
      { offset: 0.33, opacity: 1, transform: "translate(0px, 0px)", filter: "brightness(2.5)" },
      { offset: 0.4, opacity: 1, transform: "translate(0px, 0px)", filter: "brightness(0.8)" },
      { offset: 0.75, opacity: 1, transform: "translate(0px, 0px)", filter: "brightness(1)", easing: "ease-in" },
      { offset: 1, opacity: 0, transform: `translate(${u * 1.5}px, ${-u * 0.3}px)`, filter: "brightness(1)" },
    ],
    { duration },
  );
  const bw = u * 0.8;
  const bTop = cloudTop + ch * 0.8;
  const bolt = spawn(
    st,
    BOLT_SVG,
    `left:${cx - bw / 2}px;top:${bTop}px;width:${bw}px;height:${top - bTop + u * 0.2}px;transform-origin:50% 0;opacity:0`,
  );
  playProp(
    st,
    bolt,
    [
      { offset: 0, opacity: 0, transform: "scaleY(0)" },
      { offset: 0.32, opacity: 0, transform: "scaleY(0)" },
      { offset: 0.34, opacity: 1, transform: "scaleY(1)" },
      { offset: 0.37, opacity: 0.2, transform: "scaleY(1)" },
      { offset: 0.4, opacity: 1, transform: "scaleY(1)" },
      { offset: 0.46, opacity: 0, transform: "scaleY(1)" },
      { offset: 1, opacity: 0, transform: "scaleY(1)" },
    ],
    { duration },
  );
  if (box) {
    play(
      st,
      box,
      [{ filter: "brightness(1)" }, { filter: "brightness(1.5)" }, { filter: "brightness(1)" }, { filter: "brightness(1.35)" }, { filter: "brightness(1)" }],
      { duration: 220, delay: at(0.34) },
    );
  }
  const charred = LIGHT(0.5, 0, 0);
  play(
    st,
    robot,
    [
      { offset: 0, transform: "translate(0px, 0px) scale(1, 1)", filter: LIGHT(1, 0, 0) },
      { offset: 0.33, transform: "translate(0px, 0px) scale(1, 1)", filter: LIGHT(1, 0, 0) },
      { offset: 0.35, transform: "translate(-1px, -1px) scale(1.15, 1.15)", filter: LIGHT(1.6, 1, 5) },
      { offset: 0.38, transform: "translate(1px, 0px) scale(1.1, 1.1)", filter: LIGHT(1.6, 0, 5) },
      { offset: 0.41, transform: "translate(-1px, 1px) scale(1.15, 1.15)", filter: LIGHT(1.6, 1, 5) },
      { offset: 0.44, transform: "translate(1px, 0px) scale(1.1, 1.1)", filter: LIGHT(1.6, 0, 4) },
      { offset: 0.47, transform: "translate(0px, 0px) scale(1.12, 1.12)", filter: LIGHT(1.4, 1, 3) },
      { offset: 0.56, transform: "translate(0px, 0px) scale(1.05, 0.86)", filter: charred, easing: "ease-out" },
      { offset: 0.64, transform: "translate(0px, 0px) scale(1.1, 0.92)", filter: charred },
      { offset: 1, transform: "translate(0px, 0px) scale(1.08, 0.88)", filter: charred },
    ],
    { duration, fill: "forwards" },
  );
  burst(st, cx, top + u * 0.3, {
    count: 8,
    colors: [SPARK, "#fff"],
    dist: u * 1.5,
    size: u * 0.6,
    delay: at(0.34),
    duration: 320,
    line: true,
  });
  for (const [o, dx] of [[0.5, 0], [0.6, -0.25], [0.72, 0.25]]) {
    const s = u * 0.55;
    const smoke = spawn(
      st,
      "",
      `left:${cx - s / 2 + dx * u}px;top:${top - s / 2}px;width:${s}px;height:${s}px;border-radius:50%;background:#4b5058;opacity:0`,
    );
    playProp(
      st,
      smoke,
      [
        { opacity: 0.8, transform: "translate(0px, 0px) scale(0.5)" },
        { opacity: 0, transform: `translate(${dx * u}px, ${-u * 2}px) scale(1.8)` },
      ],
      { duration: 1000, delay: at(o), easing: "ease-out" },
    );
  }
};

const KNOCKOUTS = { hammer, water, anvil, glove, lightning };

export const names = Object.keys(KNOCKOUTS);

const pick = () => {
  if (!bag.length) bag = [...names].sort(() => Math.random() - 0.5);
  return bag.pop();
};

export const knockOut = (robot, name) => {
  if (!robot) return;
  const st = reset(robot);
  if (reducedMotion()) return;
  (KNOCKOUTS[name] ?? KNOCKOUTS[pick()])(robot, st);
};

export const typing = (robot) => {
  if (!robot || reducedMotion()) return () => {};
  const st = { anims: [], nodes: [] };
  play(
    st,
    robot,
    [
      { transform: "translateY(0px) rotate(0deg)" },
      { transform: "translateY(-0.6px) rotate(-1.5deg)" },
      { transform: "translateY(0px) rotate(0deg)" },
      { transform: "translateY(-0.6px) rotate(1.5deg)" },
      { transform: "translateY(0px) rotate(0deg)" },
    ],
    { duration: 2400, iterations: Infinity, easing: "ease-in-out", composite: "add" },
  );
  let timer = 0;
  const stop = () => {
    clearInterval(timer);
    for (const a of st.anims) a.cancel();
    for (const n of st.nodes) n.remove();
    st.anims.length = 0;
    st.nodes.length = 0;
  };
  timer = setInterval(() => {
    if (!robot.isConnected) return stop();
    const { u, cx, top } = measure(robot);
    const size = u * 0.6;
    const glyph = spawn(
      st,
      "",
      `left:${cx + rand(-0.5, 0.5) * u - size / 2}px;top:${top - size * 0.6}px;width:${size}px;` +
        `font:700 ${size}px/1 ui-monospace,monospace;text-align:center;color:var(--text-secondary, #9aa0a6);opacity:0`,
    );
    glyph.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const drift = rand(-0.6, 0.6) * u;
    const anim = playProp(
      st,
      glyph,
      [
        { opacity: 0, transform: "translate(0px, 0px) scale(0.6)" },
        { opacity: 0.9, offset: 0.2, transform: `translate(${drift * 0.3}px, ${-u * 0.3}px) scale(1)` },
        { opacity: 0, transform: `translate(${drift}px, ${-u * 1.3}px) scale(0.8)` },
      ],
      { duration: 650, easing: "ease-out" },
    );
    anim.finished.then(
      () => {
        st.anims.splice(st.anims.indexOf(anim), 1);
        st.nodes.splice(st.nodes.indexOf(glyph), 1);
      },
      () => {},
    );
  }, 190);
  return stop;
};

export const revive = (robot) => {
  if (!robot) return;
  const computed = getComputedStyle(robot);
  const from = computed.transform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : computed.transform;
  const fromFilter = computed.filter === "none" ? BASE_FILTER : computed.filter;
  const st = reset(robot);
  if (reducedMotion()) return;
  const u = Math.max(robot.getBoundingClientRect().height, 12);
  play(
    st,
    robot,
    [
      { offset: 0, transform: from, filter: fromFilter },
      { offset: 0.22, transform: `translateY(${-u * 0.45}px) scale(0.75, 1.4)`, filter: BASE_FILTER, easing: "ease-in" },
      { offset: 0.42, transform: "translateY(0px) scale(1.25, 0.8)", easing: "ease-out" },
      { offset: 0.6, transform: `translateY(${-u * 0.12}px) scale(0.9, 1.12)` },
      { offset: 0.76, transform: "translateY(0px) scale(1.06, 0.95)" },
      { offset: 0.9, transform: "translateY(0px) scale(0.98, 1.02)" },
      { offset: 1, transform: "translateY(0px) scale(1, 1)", filter: BASE_FILTER },
    ],
    { duration: 720 },
  );
};

export const hop = revive;

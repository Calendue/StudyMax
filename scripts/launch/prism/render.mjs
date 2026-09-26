#!/usr/bin/env node
// Renders prism.frag.glsl to public/splash/prism-splash.mp4.
//
// Copied from CalenDue's launch splash as it is. The only changes are the three preset colours
// (StudyMax's jet navy, Cherry Rose and Old Lace in place of #050505, #A78BFA and #FFFFFF) and
// where the files are written.
//
// The shader runs in headless Chrome's WebGL2 — the same API the reference
// component uses — one frame at a time, at the preset's own settings. Frames
// are rendered in strips because a headless screenshot is one image per
// browser launch and one launch per frame would take twenty minutes.
//
// See README.md for the preset and for why the app plays this instead of
// running the shader.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Portrait, at the point size of a current iPhone: the pattern's scale is set
// by u_resolution / u_pixelRatio, which is the size in points.
const WIDTH = 804;
const HEIGHT = 1748;
const PIXEL_RATIO = 2;
const FPS = 30;
/** Frames of animation, ending on the light's peak. */
const FRAMES = 97;
/** Frames holding that peak, so a slow launch never sees the light recede. */
const HOLD = 45;
/** Frames per browser launch. Height x this must stay under Chrome's limits. */
const CHUNK = 8;

const PRESET = {
  color1: '#12262B',
  color2: '#982649',
  color3: '#FFF8EB',
  rotation: -50,
  proportion: 1,
  scale: 0.01,
  speed: 30,
  distortion: 0,
  swirl: 50,
  swirlIterations: 16,
  softness: 47,
  offset: -299,
  shape: 'Checks',
  shapeSize: 45,
};

const work = join(tmpdir(), 'studymax-prism-render');
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'strips'), { recursive: true });
mkdirSync(join(work, 'seq'), { recursive: true });

const fragment = readFileSync(join(HERE, 'prism.frag.glsl'), 'utf8');
const page = `<!doctype html><html><head><meta charset=utf-8><style>
html,body{margin:0;background:${PRESET.color1}}canvas{display:block}</style></head>
<body><canvas id=out></canvas><script>
const FRAG = ${JSON.stringify(fragment)};
const VERT = '#version 300 es\\nin vec4 a_position;\\nvoid main(){ gl_Position = a_position; }';
const P = ${JSON.stringify(PRESET)};
const SHAPES = { Checks: 0, Stripes: 1, Edge: 2 };
function hexToRgba(hex) {
  const c = hex.slice(1);
  if (c.length === 3) return [parseInt(c[0]+c[0],16)/255, parseInt(c[1]+c[1],16)/255, parseInt(c[2]+c[2],16)/255, 1];
  return [parseInt(c.slice(0,2),16)/255, parseInt(c.slice(2,4),16)/255, parseInt(c.slice(4,6),16)/255, 1];
}
const q = new URLSearchParams(location.search);
const W = +q.get('w'), H = +q.get('h'), DPR = +q.get('dpr'), FPS = +q.get('fps');
const START = +q.get('start'), N = +q.get('n');
const gc = document.createElement('canvas'); gc.width = W; gc.height = H;
const gl = gc.getContext('webgl2');
function sh(t, s) {
  const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
  if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { document.title = 'ERR'; throw new Error(gl.getShaderInfoLog(o)); }
  return o;
}
const p = gl.createProgram();
gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(p); gl.useProgram(p);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(p, 'a_position');
gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const u = n => gl.getUniformLocation(p, n);
gl.viewport(0, 0, W, H);
const c1 = hexToRgba(P.color1), c2 = hexToRgba(P.color2), c3 = hexToRgba(P.color3);
const speed = (P.speed / 100) * 5;
const out = document.getElementById('out'); out.width = W; out.height = H * N;
const ctx = out.getContext('2d');
for (let i = 0; i < N; i++) {
  const elapsed = START + i / FPS;
  gl.uniform1f(u('u_time'), elapsed * speed + P.offset * 0.01);
  gl.uniform2f(u('u_resolution'), W, H);
  gl.uniform1f(u('u_pixelRatio'), DPR);
  gl.uniform1f(u('u_scale'), P.scale);
  gl.uniform1f(u('u_rotation'), (P.rotation * Math.PI) / 180);
  gl.uniform4f(u('u_color1'), c1[0], c1[1], c1[2], c1[3]);
  gl.uniform4f(u('u_color2'), c2[0], c2[1], c2[2], c2[3]);
  gl.uniform4f(u('u_color3'), c3[0], c3[1], c3[2], c3[3]);
  gl.uniform1f(u('u_proportion'), P.proportion / 100);
  gl.uniform1f(u('u_softness'), P.softness / 100);
  gl.uniform1f(u('u_shape'), SHAPES[P.shape]);
  gl.uniform1f(u('u_shapeScale'), P.shapeSize / 100);
  gl.uniform1f(u('u_distortion'), P.distortion / 50);
  gl.uniform1f(u('u_swirl'), P.swirl / 100);
  gl.uniform1f(u('u_swirlIterations'), P.swirl === 0 ? 0 : P.swirlIterations);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  ctx.drawImage(gc, 0, i * H);
}
document.title = 'OK';
</script></body></html>`;
writeFileSync(join(work, 'strip.html'), page);

for (let i = 0; i < FRAMES; i += CHUNK) {
  const n = Math.min(CHUNK, FRAMES - i);
  const name = join(work, 'strips', `${String(i).padStart(4, '0')}.png`);
  execFileSync(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', '--hide-scrollbars',
    '--force-device-scale-factor=1', `--window-size=${WIDTH},${HEIGHT * n}`,
    '--virtual-time-budget=8000', `--screenshot=${name}`,
    `file://${join(work, 'strip.html')}?w=${WIDTH}&h=${HEIGHT}&dpr=${PIXEL_RATIO}&fps=${FPS}&start=${i / FPS}&n=${n}`,
  ], { stdio: 'ignore' });
  process.stdout.write(`rendered ${Math.min(i + n, FRAMES)}/${FRAMES}\r`);
}
console.log(`\nrendered ${FRAMES} frames`);

let index = 0;
for (const strip of readdirSync(join(work, 'strips')).sort()) {
  const start = Number(strip.slice(0, 4));
  const parts = join(work, 'strips', `cut-${start}`);
  mkdirSync(parts, { recursive: true });
  execFileSync('magick', [join(work, 'strips', strip), '-crop', `${WIDTH}x${HEIGHT}`, '+repage', join(parts, 'p-%03d.png')]);
  for (const piece of readdirSync(parts).sort()) {
    copyFileSync(join(parts, piece), join(work, 'seq', `g${String(index++).padStart(4, '0')}.png`));
  }
}
const last = join(work, 'seq', `g${String(index - 1).padStart(4, '0')}.png`);
for (let i = 0; i < HOLD; i++) {
  copyFileSync(last, join(work, 'seq', `g${String(index++).padStart(4, '0')}.png`));
}
console.log(`sequenced ${index} frames (${(index / FPS).toFixed(2)}s)`);

const video = join(ROOT, 'public/splash/prism-splash.mp4');
mkdirSync(dirname(video), { recursive: true });
execFileSync('ffmpeg', [
  '-y', '-framerate', String(FPS), '-i', join(work, 'seq', 'g%04d.png'),
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-crf', '19', '-preset', 'slow', '-movflags', '+faststart', '-an', video,
], { stdio: 'ignore' });
execFileSync('magick', [last, '-quality', '88', join(ROOT, 'public/splash/prism-still.jpg')]);
console.log(`wrote ${video}`);

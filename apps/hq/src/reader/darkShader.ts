/**
 * Dark mode for rendered pages (PDF), on the GPU.
 *
 * A plain colour inversion turns red into cyan and makes photos look like
 * negatives. This shader instead remaps lightness only: white paper becomes
 * the reader's dark paper, black text becomes its light ink, and whatever
 * colour a pixel had (a red stamp, a green chart line) is kept on top. One
 * WebGL canvas is shared by every page; each result is copied to the page's
 * own canvas.
 */

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec3 u_paper;
uniform vec3 u_ink;
varying vec2 v_uv;
const vec3 W = vec3(0.2126, 0.7152, 0.0722);
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  // Transparent areas of a page are paper.
  vec3 rgb = mix(vec3(1.0), c.rgb, c.a);
  float l = dot(rgb, W);
  vec3 chroma = rgb - vec3(l);
  // Lightness flips: paper (l = 1) -> dark paper, ink (l = 0) -> light ink.
  // The curve pulls greys toward the ink, so thin and grey text stays legible.
  float k = pow(l, 1.6);
  vec3 base = mix(u_ink, u_paper, k);
  gl_FragColor = vec4(clamp(base + chroma * 0.9, 0.0, 1.0), 1.0);
}`;

type Gl = { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; tex: WebGLTexture };
let shared: Gl | null | undefined;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

function setup(paper: [number, number, number], ink: [number, number, number]): Gl | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform3fv(gl.getUniformLocation(prog, "u_paper"), paper);
  gl.uniform3fv(gl.getUniformLocation(prog, "u_ink"), ink);
  gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
  return { canvas, gl, tex };
}

/** The reader's dark paper and ink, as 0–1 RGB. */
const PAPER: [number, number, number] = [0x10 / 255, 0x13 / 255, 0x11 / 255];
const INK: [number, number, number] = [0xf0 / 255, 0xf4 / 255, 0xf1 / 255];

/** Lightest and darkest luminance (0–1) of a canvas, from a small copy. */
function lightRange(c: HTMLCanvasElement): { min: number; max: number } | null {
  const probe = document.createElement("canvas");
  probe.width = 48;
  probe.height = Math.max(1, Math.round((48 * c.height) / Math.max(1, c.width)));
  const g = probe.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(c, 0, 0, probe.width, probe.height);
  const d = g.getImageData(0, 0, probe.width, probe.height).data;
  let min = 1;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  return { min, max };
}

/**
 * Some graphics drivers draw nothing from a shared canvas texture. After the
 * first page, compare: if the page had ink but the dark copy has no light
 * ink, the GPU path is switched off for the session and the caller falls back.
 */
let verified = false;

/**
 * Draw `src` darkened onto `out`. Returns false when WebGL is not available
 * or does not work on this computer, so the caller can fall back to a CSS filter.
 */
export function drawDark(src: HTMLCanvasElement, out: HTMLCanvasElement): boolean {
  if (shared === undefined) {
    try {
      shared = setup(PAPER, INK);
    } catch {
      shared = null;
    }
  }
  if (!shared) return false;
  const { canvas, gl, tex } = shared;
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (src.width > max || src.height > max) return false;
  canvas.width = src.width;
  canvas.height = src.height;
  gl.viewport(0, 0, src.width, src.height);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0);
  if (!verified) {
    const before = lightRange(src);
    const after = lightRange(out);
    if (before && after && before.min < 0.5) {
      if (after.max < 0.5) {
        console.warn("Afisa Ugani: GPU dark mode drew an empty page on this computer; using the CSS filter instead.");
        shared = null;
        return false;
      }
      verified = true;
    }
  }
  return true;
}

import React, { useEffect, useRef, useState } from 'react';
import { Box, Camera, CircleAlert, MapPin, Rotate3D, X } from 'lucide-react';
import Button from './Button';

const multiplyMatrices = (a, b, out = new Float32Array(16)) => {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
};

const translationMatrix = (x, y, z) => new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  x, y, z, 1,
]);

function createXRRenderer(gl) {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, `
    attribute vec3 aPosition;
    uniform mat4 uMvp;
    uniform float uPointSize;
    void main() {
      gl_Position = uMvp * vec4(aPosition, 1.0);
      gl_PointSize = uPointSize;
    }
  `);
  gl.compileShader(vertexShader);

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, `
    precision mediump float;
    uniform vec4 uColor;
    void main() {
      gl_FragColor = uColor;
    }
  `);
  gl.compileShader(fragmentShader);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Unable to initialize the immersive parcel renderer.');
  }

  const position = gl.getAttribLocation(program, 'aPosition');
  const mvpUniform = gl.getUniformLocation(program, 'uMvp');
  const colorUniform = gl.getUniformLocation(program, 'uColor');
  const pointSizeUniform = gl.getUniformLocation(program, 'uPointSize');
  const buffers = [];
  const createMesh = (vertices, mode, color, pointSize = 1) => {
    const data = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    buffers.push(buffer);
    return { buffer, mode, color: new Float32Array(color), pointSize, vertexCount: data.length / 3 };
  };

  const grid = [];
  for (let line = -5; line <= 5; line += 1) {
    const offset = line * 0.22;
    grid.push(-1.1, -0.025, offset, 1.1, -0.025, offset);
    grid.push(offset, -0.025, -1.1, offset, -0.025, 1.1);
  }

  const meshes = [
    createMesh(grid, gl.LINES, [0.52, 0.68, 0.59, 0.5]),
    createMesh([
      -0.65, 0, -0.45, 0.65, 0, -0.45, 0.65, -0.08, -0.45,
      -0.65, 0, -0.45, 0.65, -0.08, -0.45, -0.65, -0.08, -0.45,
      0.65, 0, -0.45, 0.65, 0, 0.45, 0.65, -0.08, 0.45,
      0.65, 0, -0.45, 0.65, -0.08, 0.45, 0.65, -0.08, -0.45,
      0.65, 0, 0.45, -0.65, 0, 0.45, -0.65, -0.08, 0.45,
      0.65, 0, 0.45, -0.65, -0.08, 0.45, 0.65, -0.08, 0.45,
      -0.65, 0, 0.45, -0.65, 0, -0.45, -0.65, -0.08, -0.45,
      -0.65, 0, 0.45, -0.65, -0.08, -0.45, -0.65, -0.08, 0.45,
    ], gl.TRIANGLES, [0.04, 0.36, 0.23, 0.92]),
    createMesh([
      -0.65, 0, -0.45, 0.65, 0, -0.45, 0.65, 0, 0.45,
      -0.65, 0, -0.45, 0.65, 0, 0.45, -0.65, 0, 0.45,
    ], gl.TRIANGLES, [0.12, 0.67, 0.42, 0.84]),
    createMesh([
      -0.65, 0.008, -0.45, 0.65, 0.008, -0.45,
      0.65, 0.008, 0.45, -0.65, 0.008, 0.45,
    ], gl.LINE_LOOP, [0.78, 0.96, 0.85, 1]),
    createMesh([0.25, 0.015, 0.08, 0.25, 0.34, 0.08], gl.LINES, [1, 0.77, 0.28, 1]),
    createMesh([0.25, 0.38, 0.08], gl.POINTS, [1, 0.76, 0.22, 1], 16),
  ];
  const floorModel = translationMatrix(0, 0.08, -2.2);
  const fallbackModel = translationMatrix(0, -0.97, -2.2);
  const viewModel = new Float32Array(16);
  const mvp = new Float32Array(16);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    drawScene(projection, view, floorSpace) {
      multiplyMatrices(view, floorSpace ? floorModel : fallbackModel, viewModel);
      multiplyMatrices(projection, viewModel, mvp);
      gl.useProgram(program);
      gl.enableVertexAttribArray(position);
      gl.uniformMatrix4fv(mvpUniform, false, mvp);
      for (const mesh of meshes) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
        gl.uniform4fv(colorUniform, mesh.color);
        gl.uniform1f(pointSizeUniform, mesh.pointSize);
        gl.drawArrays(mesh.mode, 0, mesh.vertexCount);
      }
    },
    dispose() {
      buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    },
  };
}

export default function ParcelViewer({ property, lang = 'en' }) {
  const bn = lang === 'bn';
  const [view, setView] = useState('2d');
  const [rotation, setRotation] = useState(24);
  const [tilt, setTilt] = useState(52);
  const [showMarker, setShowMarker] = useState(false);
  const [xrMode, setXrMode] = useState(null);
  const [immersive, setImmersive] = useState(false);
  const [xrError, setXrError] = useState('');
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    let active = true;
    const detectImmersiveSupport = async () => {
      if (!navigator.xr?.isSessionSupported) return;
      try {
        if (await navigator.xr.isSessionSupported('immersive-ar')) {
          if (active) setXrMode('immersive-ar');
          return;
        }
        if (await navigator.xr.isSessionSupported('immersive-vr') && active) {
          setXrMode('immersive-vr');
        }
      } catch {
        if (active) setXrMode(null);
      }
    };
    detectImmersiveSupport();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (sessionRef.current) sessionRef.current.end().catch(() => {});
  }, []);

  const enterImmersive = async () => {
    if (!xrMode || !canvasRef.current || !overlayRef.current) return;
    setXrError('');
    let session;
    let renderer;
    try {
      const options = {
        optionalFeatures: ['local-floor', 'dom-overlay'],
        domOverlay: { root: overlayRef.current },
      };
      session = await navigator.xr.requestSession(xrMode, options);
      sessionRef.current = session;
      setImmersive(true);

      const canvas = canvasRef.current;
      const gl = canvas.getContext('webgl', { alpha: xrMode === 'immersive-ar', antialias: true });
      if (!gl) throw new Error('WebGL is not available in this browser.');
      await gl.makeXRCompatible();
      renderer = createXRRenderer(gl);
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

      let referenceSpace;
      let floorSpace = true;
      try {
        referenceSpace = await session.requestReferenceSpace('local-floor');
      } catch {
        referenceSpace = await session.requestReferenceSpace('local');
        floorSpace = false;
      }

      session.addEventListener('end', () => {
        renderer?.dispose();
        sessionRef.current = null;
        setImmersive(false);
      }, { once: true });

      const renderFrame = (_time, frame) => {
        const currentSession = frame.session;
        const pose = frame.getViewerPose(referenceSpace);
        if (pose) {
          const layer = currentSession.renderState.baseLayer;
          gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          for (const eye of pose.views) {
            const viewport = layer.getViewport(eye);
            gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            renderer.drawScene(eye.projectionMatrix, eye.transform.inverse.matrix, floorSpace);
          }
        }
        currentSession.requestAnimationFrame(renderFrame);
      };
      session.requestAnimationFrame(renderFrame);
    } catch (error) {
      renderer?.dispose();
      if (session) session.end().catch(() => {});
      sessionRef.current = null;
      setImmersive(false);
      setXrError(error?.message || (bn ? 'ইমারসিভ ভিউ চালু করা যায়নি।' : 'Unable to start the immersive view.'));
    }
  };

  const endImmersive = () => sessionRef.current?.end().catch(() => {});

  return (
    <section className="parcel-viewer rounded-xl border border-emerald-200/80 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 overflow-hidden" aria-label={bn ? 'জমির 2D ও 3D দৃশ্য' : 'Parcel 2D and 3D viewer'}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-emerald-100 dark:border-emerald-900">
        <div>
          <h4 className="font-bold text-sm flex items-center gap-2 text-gray-900 dark:text-white">
            <Rotate3D className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            {bn ? 'পার্সেল ভিজ্যুয়ালাইজার' : 'Parcel visualizer'}
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5">{bn ? 'রেকর্ডের তথ্য দিয়ে তৈরি একটি ইন্টারঅ্যাক্টিভ স্কিম্যাটিক' : 'An interactive schematic using this parcel record'}</p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={bn ? 'দৃশ্য নির্বাচন' : 'Choose view'}>
          <Button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${view === '2d' ? 'bg-emerald-800 text-white' : 'bg-white/80 dark:bg-slate-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-700'}`}>
            <MapPin className="w-3.5 h-3.5" /> 2D
          </Button>
          <Button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${view === '3d' ? 'bg-emerald-800 text-white' : 'bg-white/80 dark:bg-slate-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-700'}`}>
            <Box className="w-3.5 h-3.5" /> 3D
          </Button>
          {xrMode && (
            <Button type="button" onClick={enterImmersive} className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-emerald-700 text-white hover:bg-emerald-800">
              <Camera className="w-3.5 h-3.5" /> {xrMode === 'immersive-ar' ? (bn ? 'AR-এ দেখুন' : 'View in AR') : (bn ? 'VR-এ দেখুন' : 'View in VR')}
            </Button>
          )}
        </div>
      </div>

      <div className="relative h-56 sm:h-64 overflow-hidden bg-[linear-gradient(135deg,#effaf3,#e2f3e9_48%,#f7fbf7)] dark:bg-[linear-gradient(135deg,#0d2119,#102a20_48%,#12231d)]">
        <div aria-hidden="true" className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(rgba(16,120,77,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(16,120,77,.12) 1px,transparent 1px)', backgroundSize: '26px 26px' }} />
        <div className={`parcel-plan ${view === '3d' ? 'parcel-plan-3d' : ''}`} style={view === '3d' ? { transform: `translate(-50%, -48%) perspective(700px) rotateX(${tilt}deg) rotateZ(${rotation}deg)` } : undefined}>
          <svg viewBox="0 0 420 220" role="img" aria-label={bn ? 'স্কিম্যাটিক জমির প্লট, জরিপ ম্যাপ নয়' : 'Illustrative parcel schematic, not a survey map'} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="parcel-fill" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity=".62" />
                <stop offset="100%" stopColor="#059669" stopOpacity=".38" />
              </linearGradient>
              <filter id="parcel-shadow" x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#065f46" floodOpacity=".2" />
              </filter>
            </defs>
            <path d="M75 54 L305 39 L352 158 L116 183 Z" fill="url(#parcel-fill)" stroke="#047857" strokeWidth="3" strokeLinejoin="round" filter="url(#parcel-shadow)" />
            <path d="M89 69 L290 56 M103 100 L320 86 M111 132 L333 118 M138 168 L342 146 M122 50 L156 178 M181 46 L209 173 M239 43 L266 167 M291 40 L316 162" fill="none" stroke="#047857" strokeOpacity=".28" strokeWidth="1.2" strokeDasharray="4 5" />
            <path d="M75 54 L305 39 L352 158 L116 183 Z" fill="none" stroke="#065f46" strokeWidth="2" strokeDasharray="7 5" />
          </svg>
          <Button type="button" onClick={() => setShowMarker((shown) => !shown)} aria-expanded={showMarker} className="parcel-info-marker absolute left-[62%] top-[39%] z-10 w-9 h-9 rounded-full bg-amber-400 text-amber-950 border-2 border-white shadow-lg flex items-center justify-center" title={bn ? 'রেকর্ডের তথ্য দেখুন' : 'Show record information'}>
            <MapPin className="w-4 h-4" />
          </Button>
        </div>
        {showMarker && (
          <div className="absolute left-3 right-3 sm:left-auto sm:right-4 top-3 sm:w-64 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-emerald-200 dark:border-emerald-800 shadow-lg p-3 text-xs z-20">
            <div className="flex items-start justify-between gap-2">
              <div>
                <strong className="font-mono text-emerald-800 dark:text-emerald-300">{property.plot_id}</strong>
                <p className="mt-1">{property.mouza}, {property.district}</p>
                <p className="text-gray-500">{bn ? 'রেকর্ডকৃত পরিমাণ' : 'Recorded area'}: {property.area} {bn ? 'শতক' : 'shotok'}</p>
                <p className="text-gray-500">{bn ? 'খতিয়ান' : 'Khatian'}: {property.khatian_no}</p>
              </div>
              <Button type="button" onClick={() => setShowMarker(false)} className="text-gray-500 hover:text-gray-900" aria-label={bn ? 'তথ্য বন্ধ করুন' : 'Close information'}><X className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {view === '3d' && (
          <div className="absolute left-3 right-3 bottom-2 z-10 flex items-center gap-3 text-[10px] sm:text-xs bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm rounded-lg px-3 py-2">
            <label className="flex-1 flex items-center gap-2 text-gray-700 dark:text-gray-200">
              <span>{bn ? 'ঘোরান' : 'Rotate'}</span>
              <input type="range" min="-180" max="180" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} aria-label={bn ? 'প্লট ঘোরান' : 'Rotate parcel'} className="w-full accent-emerald-700" />
            </label>
            <label className="flex-1 flex items-center gap-2 text-gray-700 dark:text-gray-200">
              <span>{bn ? 'কাত' : 'Tilt'}</span>
              <input type="range" min="30" max="68" value={tilt} onChange={(event) => setTilt(Number(event.target.value))} aria-label={bn ? 'দৃশ্যের কাত' : 'Scene tilt'} className="w-full accent-emerald-700" />
            </label>
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex items-start gap-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-950/30">
        <CircleAlert className="w-4 h-4 flex-none mt-0.5" />
        <p>{bn ? 'এটি কেবল তথ্যভিত্তিক স্কিম্যাটিক। প্রকৃত অবস্থান, আকৃতি বা স্কেল বোঝায় না এবং এটি জরিপকৃত বা আইনগত সীমানা নয়। এই রেকর্ডে ভৌগোলিক স্থানাঙ্ক নেই।' : 'Illustrative schematic only. It does not show the parcel’s actual location, shape, or scale and is not a surveyed or legally verified boundary. This record has no geographic coordinates.'}</p>
      </div>

      {xrError && <p role="status" className="px-4 py-2 text-xs text-rose-700 dark:text-rose-300">{xrError}</p>}

      <div ref={overlayRef} className="parcel-xr-overlay-root">
        {immersive && (
          <div className="parcel-xr-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="font-mono">{property.plot_id}</strong>
                <p className="text-xs">{property.mouza}, {property.district}</p>
                <p className="text-xs">{bn ? 'রেকর্ডকৃত পরিমাণ' : 'Recorded area'}: {property.area} {bn ? 'শতক' : 'shotok'}</p>
              </div>
              <Button type="button" onClick={endImmersive} className="rounded-lg bg-white/90 text-gray-900 px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5">
                <X className="w-4 h-4" /> {bn ? 'বন্ধ করুন' : 'Exit view'}
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-snug">{bn ? 'স্কিম্যাটিক মডেল—জরিপ সীমানা নয় এবং প্রকৃত জমির অবস্থানের সঙ্গে যুক্ত নয়।' : 'Schematic model — not a surveyed boundary and not geo-anchored to the actual parcel.'}</p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="parcel-xr-canvas" aria-hidden="true" />
    </section>
  );
}

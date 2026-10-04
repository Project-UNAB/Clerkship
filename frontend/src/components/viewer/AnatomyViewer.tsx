import { useState, useRef, useEffect, useCallback } from 'react';
import { Activity } from 'lucide-react';

export type Gender = 'male' | 'female';
export type Lang   = 'es'   | 'en';
type ComboKey = `${Lang}-${Gender}`;

/* ── Model registry ─────────────────────────────────────────
   4 distinct BioDigital models: 2 languages × 2 genders.
   ─────────────────────────────────────────────────────────── */
const MODELS: Record<ComboKey, { id: string; uaid: string }> = {
  'en-male':   { id: '7BgM', uaid: 'McMal' },
  'en-female': { id: '7BgK', uaid: 'McMaU' },
  'es-male':   { id: '7BgB', uaid: 'McMZW' },
  'es-female': { id: '7BgI', uaid: 'McMYm' },
};

/* ── URL builder ────────────────────────────────────────────
   Optimised params: help/share/tutorial/video off to reduce
   the number of scripts BioDigital loads.
   ─────────────────────────────────────────────────────────── */
const UI_PARAMS = new URLSearchParams({
  'ui-anatomy-descriptions':  'true',
  'ui-anatomy-pronunciations':'true',
  'ui-anatomy-labels':        'true',
  'ui-audio':                 'true',
  'ui-chapter-list':          'false',
  'ui-fullscreen':            'true',
  'ui-help':                  'false',   // fewer scripts
  'ui-info':                  'false',   // info panel closed on load
  'ui-label-list':            'true',
  'ui-layers':                'true',
  'ui-skin-layers':           'true',
  'ui-loader':                'circle',
  'ui-media-controls':        'full',
  'ui-menu':                  'true',
  'ui-nav':                   'true',
  'ui-search':                'true',
  'ui-tools':                 'true',
  'ui-tutorial':              'false',   // fewer scripts
  'ui-undo':                  'true',
  'ui-whiteboard':            'true',
  'ui-anatomy-tree':          'false',
  'ui-dissect':               'true',
  'disable-scroll':           'false',
  'paid':                     'o_02dc5bf5',
}).toString();

function buildUrl(key: ComboKey): string {
  const { id, uaid } = MODELS[key];
  return `https://human.biodigital.com/viewer/?id=${id}&uaid=${uaid}&${UI_PARAMS}`;
}

/* ── Layers + camera-fit via postMessage ────────────────────*/
function initViewer(win: Window) {
  const o = 'https://human.biodigital.com';
  win.postMessage({ type: 'ui', action: 'show', panel: 'layers' }, o);
  win.postMessage(JSON.stringify({ type: 'ui', action: 'show', panel: 'layers' }), o);
  win.postMessage({ call: 'ui.panel.show', args: ['layers'] }, o);
  win.postMessage({ call: 'scene.fit' },    o);
  win.postMessage({ call: 'scene.fitAll' }, o);
  win.postMessage({ call: 'camera.fit' },   o);
}

/* ── Loading overlay ────────────────────────────────────────*/
function LoadingOverlay({ lang }: { lang: Lang }) {
  return (
    <div className="av-loading">
      <div className="av-loading-gem">
        <Activity size={22} color="#fff" strokeWidth={2} />
      </div>
      <p className="av-loading-title">
        {lang === 'es' ? 'Cargando modelo anatómico…' : 'Loading anatomy model…'}
      </p>
      <p className="av-loading-sub">
        {lang === 'es'
          ? 'Sistema Óseo · Nervioso · Muscular'
          : 'Skeletal · Nervous · Muscular systems'}
      </p>
      <div className="av-loading-bar">
        <div className="av-loading-bar-fill" />
      </div>
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────
   Strategy: render all 4 iframes simultaneously (prefetch).
   Only the active one is visible; the others load silently
   in the background so switching gender/lang is instant.
   ─────────────────────────────────────────────────────────── */
const ALL_COMBOS: ComboKey[] = ['es-male', 'es-female', 'en-male', 'en-female'];

interface Props {
  gender: Gender;
  lang:   Lang;
}

/* ── Undo / Redo via postMessage ────────────────────────────
   BioDigital's viewer handles Ctrl+Z natively when it has
   focus. This helper forwards the commands when focus is
   elsewhere (our UI panels, tabs, etc.).
   ─────────────────────────────────────────────────────────── */
function sendUndoRedo(win: Window, action: 'undo' | 'redo') {
  const o = 'https://human.biodigital.com';
  /* Try several message formats — BioDigital API version varies */
  win.postMessage({ call: action },                  o);
  win.postMessage({ type: action },                  o);
  win.postMessage({ type: 'action', value: action }, o);
  win.postMessage(JSON.stringify({ call: action }),  o);
}

export default function AnatomyViewer({ gender, lang }: Props) {
  const activeKey = `${lang}-${gender}` as ComboKey;
  const [loaded, setLoaded] = useState<Partial<Record<ComboKey, boolean>>>({});
  const refs = useRef<Partial<Record<ComboKey, HTMLIFrameElement | null>>>({});

  /* Ctrl+Z → undo | Ctrl+Y → redo
     Intercepts shortcuts at the parent-window level and forwards
     them to the active iframe. Also re-focuses the iframe so that
     subsequent shortcuts reach BioDigital's own handler directly. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      const action = key === 'z' ? 'undo' : 'redo';
      const iframe = refs.current[activeKey];
      const win    = iframe?.contentWindow;

      if (!win) return;
      e.preventDefault();
      sendUndoRedo(win, action);

      /* Re-focus the iframe so future shortcuts go directly to BioDigital */
      try { iframe?.focus(); } catch { /* cross-origin — silently ignored */ }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeKey]);

  /* Listen for BioDigital "ready" events and init the relevant iframe */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      const isReady =
        d === 'human.ready' ||
        d?.type === 'human.ready' ||
        d?.type === 'ready' ||
        d?.event === 'ready' ||
        (typeof d === 'string' && (d.includes('"ready"') || d === 'ready'));

      if (!isReady) return;
      /* Find which iframe fired the event by matching the source window */
      for (const key of ALL_COMBOS) {
        const iframe = refs.current[key];
        if (iframe?.contentWindow && iframe.contentWindow === e.source) {
          initViewer(iframe.contentWindow);
          break;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleLoad = useCallback((key: ComboKey) => {
    setLoaded(prev => ({ ...prev, [key]: true }));
    const win = refs.current[key]?.contentWindow;
    if (win) initViewer(win);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      {/* Loading overlay — shown until the active model is ready */}
      {!loaded[activeKey] && <LoadingOverlay lang={lang} />}

      {/* All 4 iframes — only the active one is visible/interactive */}
      {ALL_COMBOS.map(key => (
        <iframe
          key={key}
          ref={el => { refs.current[key] = el; }}
          id={`biodigital-${key}`}
          title={`BioDigital Human — ${key}`}
          src={buildUrl(key)}
          frameBorder={0}
          allowFullScreen
          loading={key === activeKey ? 'eager' : 'lazy'}
          allow="fullscreen"
          onLoad={() => handleLoad(key)}
          style={{
            position:      'absolute',
            top:           0,
            left:          0,
            width:         '100%',
            height:        '100%',
            border:        'none',
            display:       'block',
            opacity:       key === activeKey ? 1 : 0,
            pointerEvents: key === activeKey ? 'auto' : 'none',
            zIndex:        key === activeKey ? 1 : 0,
            transition:    'opacity 0.35s ease',
          }}
        />
      ))}
    </div>
  );
}

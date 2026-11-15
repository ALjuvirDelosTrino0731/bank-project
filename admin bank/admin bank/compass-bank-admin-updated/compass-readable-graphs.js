/* Compass Bank: make research graphs readable and full width.
   Purely presentational: no evaluation data, model results, or API actions are changed. */
(function () {
  'use strict';
  if (window.CompassReadableGraphs && window.CompassReadableGraphs.installed) return;

  const STYLE_ID = 'compass-readable-graphs-style';
  const GRAPH_RE = /(?:residual|regression|trend|actual.?vs|predicted|confusion|matrix|forecast|graph|plot|chart)/i;
  const PAGE_RE = /(?:SOP\s*3|Regression Evaluation|holdout evaluation plots|Graphical trend comparison|Predicted vs\.?\s*test.data|Residual distribution|Classification confusion matrix|Actual vs predicted)/i;
  const styleText = `
  /* Scoped to pages displaying machine-learning evaluation plots only. */
  body.compass-readable-graphs .compass-graph-stack {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-auto-flow: row !important;
    align-items: stretch !important;
    gap: 28px !important;
    width: 100% !important;
    max-width: none !important;
  }
  body.compass-readable-graphs .compass-graph-stack > .compass-graph-card {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    flex: 0 0 100% !important;
    align-self: stretch !important;
    box-sizing: border-box !important;
  }
  body.compass-readable-graphs .compass-matrix-card {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
  }
  body.compass-readable-graphs .compass-graph-fill {
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
  }
  body.compass-readable-graphs img.compass-full-graph,
  body.compass-readable-graphs svg.compass-full-graph {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: none !important;
    object-fit: contain !important;
    margin: 12px auto !important;
  }
  body.compass-readable-graphs img.compass-full-graph.compass-matrix-graph {
    max-width: 850px !important;
  }
  body.compass-readable-graphs canvas.compass-full-graph {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 420px !important;
    min-height: 360px !important;
    margin: 8px auto 16px !important;
  }
  body.compass-readable-graphs .compass-graph-card h2,
  body.compass-readable-graphs .compass-graph-card h3,
  body.compass-readable-graphs .compass-graph-card h4 {
    margin-top: 0.5em !important;
    margin-bottom: 0.75em !important;
  }
  @media (max-width: 650px) {
    body.compass-readable-graphs .compass-graph-stack { gap: 18px !important; }
    body.compass-readable-graphs canvas.compass-full-graph {
      height: 310px !important;
      min-height: 270px !important;
    }
  }
  `;

  function hasRelevantContent() {
    const path = location.pathname || '';
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
      .map((h) => h.textContent || '').join(' ');
    return PAGE_RE.test(headings) ||
      (/sop.?3|evaluation|research|regression/i.test(path) &&
       PAGE_RE.test(document.body ? document.body.textContent.slice(0, 22000) : ''));
  }
  function isGraph(el) {
    if (!el || !el.tagName) return false;
    const name = el.tagName.toLowerCase();
    if (name === 'img') {
      const desc = (el.getAttribute('src') || '') + ' ' + (el.getAttribute('alt') || '');
      if (/logo|avatar|icon|favicon|brand/i.test(desc) && !GRAPH_RE.test(desc)) return false;
      return GRAPH_RE.test(desc) ||
        ((el.naturalWidth || el.width || 0) >= 350 &&
         (el.naturalHeight || el.height || 0) >= 160);
    }
    if (name === 'canvas') {
      const w = el.width || el.clientWidth || 0;
      const h = el.height || el.clientHeight || 0;
      return w >= 240 && h >= 100;
    }
    return false;
  }
  function chartNodes() {
    return Array.from(document.querySelectorAll('main img,main canvas,section img,section canvas,article img,article canvas,.panel img,.panel canvas,.card img,.card canvas'))
      .filter((el) => isGraph(el) && !el.closest('header,nav,footer'));
  }
  function markStack(media, all) {
    // Find the NEAREST parent whose distinct direct children each own a chart.
    // This avoids converting the whole dashboard or its metrics cards to one column.
    let level = media;
    for (let depth = 0; depth < 9 && level.parentElement; depth++) {
      const parent = level.parentElement;
      if (parent === document.body || parent.tagName === 'MAIN' || parent.tagName === 'HTML') break;
      const chartChildren = Array.from(parent.children).filter((child) =>
        all.some((graph) => child === graph || child.contains(graph))
      );
      if (chartChildren.length >= 2 && chartChildren.length <= 5) {
        parent.classList.add('compass-graph-stack');
        chartChildren.forEach((child) => child.classList.add('compass-graph-card'));
        return;
      }
      level = parent;
    }
  }
  function markFill(media) {
    let p = media.parentElement;
    let steps = 0;
    while (p && steps < 4 && !p.classList.contains('compass-graph-card')) {
      if (p.tagName !== 'BODY' && p.tagName !== 'MAIN' && p.tagName !== 'SECTION') {
        p.classList.add('compass-graph-fill');
      }
      p = p.parentElement;
      steps++;
    }
  }
  function expandMatrix(media) {
    if (!media.classList.contains('compass-matrix-graph')) return;
    let child = media;
    for (let depth = 0; depth < 7 && child.parentElement; depth++) {
      const parent = child.parentElement;
      if (parent.tagName === 'MAIN' || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
      const computed = window.getComputedStyle(parent);
      if (computed.display.indexOf('grid') >= 0 && parent.children.length >= 2) {
        child.classList.add('compass-matrix-card');
        break;
      }
      child = parent;
    }
  }
  let lastCount = 0;
  function resizeChartJs(graphs) {
    graphs.forEach((node) => {
      if (node.tagName !== 'CANVAS' || !window.Chart || typeof window.Chart.getChart !== 'function') return;
      const chart = window.Chart.getChart(node);
      if (!chart) return;
      if (chart.options.maintainAspectRatio !== false) chart.options.maintainAspectRatio = false;
      try { chart.resize(); } catch (_) { /* chart may still be initializing */ }
    });
  }
  function apply() {
    if (!document.body || !hasRelevantContent()) return 0;
    const all = chartNodes();
    if (!all.length) return 0;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = styleText;
      document.head.appendChild(style);
    }
    document.body.classList.add('compass-readable-graphs');
    all.forEach((media) => {
      media.classList.add('compass-full-graph');
      const desc = (media.getAttribute('src') || '') + ' ' + (media.getAttribute('alt') || '');
      if (/confusion|matrix/i.test(desc)) media.classList.add('compass-matrix-graph');
    });
    all.forEach((media) => markStack(media, all));
    all.forEach(markFill);
    all.forEach(expandMatrix);
    if (lastCount !== all.length) {
      lastCount = all.length;
      window.setTimeout(() => resizeChartJs(all), 160);
    }
    window.CompassReadableGraphs.chartsFound = all.length;
    window.CompassReadableGraphs.stacksFound = document.querySelectorAll('.compass-graph-stack').length;
    return all.length;
  }
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => { pending = false; apply(); }, 130);
  }
  function init() {
    apply();
    // Handles SOP pages injected asynchronously by the admin app.
    if (window.MutationObserver) {
      new MutationObserver((changes) => {
        if (changes.some((m) => m.addedNodes.length || m.removedNodes.length)) schedule();
      }).observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
  }
  window.CompassReadableGraphs = { installed: true, version: '1.0', chartsFound: 0, stacksFound: 0, run: apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
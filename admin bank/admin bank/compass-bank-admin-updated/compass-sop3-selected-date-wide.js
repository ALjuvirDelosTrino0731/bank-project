/* Compass Bank - SOP3 selected-date chart layout only.
   Styling only: does NOT change predictions, data, model results or scores. */
(function () {
  'use strict';
  if (window.CompassSOP3DateCharts && window.CompassSOP3DateCharts.installed) return;

  const NAME = 'compass-sop3-date-chart-layout';
  const FIRST = /^test[\s-]*data\s+actual\s+vs\.?\s+model\s+prediction\s*$/i;
  const SECOND = /^residuals\s+for\s+this\s+selected\s+date\s*$/i;
  const state = {
    installed: true,
    applied: false,
    cards: 0,
    charts: 0,
    refresh: apply
  };
  window.CompassSOP3DateCharts = state;

  const CSS = `
    .${NAME} {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      grid-auto-flow: row !important;
      gap: 26px !important;
      width: 100% !important;
      max-width: 100% !important;
      align-items: stretch !important;
    }
    .${NAME} > .${NAME}-card {
      grid-column: 1 / -1 !important;
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      min-width: 0 !important;
      flex: 0 0 100% !important;
      box-sizing: border-box !important;
      overflow: visible !important;
    }
    .${NAME} > .${NAME}-card canvas {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      height: 380px !important;
      max-height: none !important;
    }
    .${NAME} > .${NAME}-card img,
    .${NAME} > .${NAME}-card svg {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      max-height: none !important;
      object-fit: contain !important;
    }
    .${NAME} > .${NAME}-card h2,
    .${NAME} > .${NAME}-card h3,
    .${NAME} > .${NAME}-card h4 {
      margin-bottom: 12px !important;
    }
    @media (max-width: 600px) {
      .${NAME} { gap: 18px !important; }
      .${NAME} > .${NAME}-card canvas { height: 320px !important; }
    }
  `;

  function text(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function findHeading(pattern) {
    const selectors = ['h2,h3,h4,h5,h6,legend', 'strong,b', 'p,span,div'];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const value = text(el);
        // Exact matches only: don't accidentally select a large parent panel.
        if (value.length <= 85 && pattern.test(value)) return el;
      }
    }
    return null;
  }
  function directChild(parent, node) {
    let el = node;
    while (el && el.parentElement !== parent) el = el.parentElement;
    return el;
  }
  function ensureStyles() {
    if (document.getElementById(NAME + '-style')) return;
    const sheet = document.createElement('style');
    sheet.id = NAME + '-style';
    sheet.textContent = CSS;
    document.head.appendChild(sheet);
  }
  function resizeCharts(cards) {
    for (const card of cards) {
      for (const canvas of card.querySelectorAll('canvas')) {
        // Charts should have a spacious plotting area. Do not modify chart data.
        const p = canvas.parentElement;
        if (p && p !== card) {
          p.style.setProperty('width', '100%', 'important');
          p.style.setProperty('max-width', 'none', 'important');
          p.style.setProperty('min-width', '0', 'important');
        }
        try {
          if (window.Chart && typeof window.Chart.getChart === 'function') {
            const chart = window.Chart.getChart(canvas);
            if (chart) {
              chart.options.responsive = true;
              chart.options.maintainAspectRatio = false;
              chart.resize();
              continue;
            }
          }
        } catch (e) {
          console.warn('SOP3 chart resize was skipped:', e);
        }
      }
    }
  }
  let resizeJob = null;
  function scheduleResize(cards) {
    if (resizeJob !== null) clearTimeout(resizeJob);
    resizeJob = setTimeout(function () {
      resizeJob = null;
      resizeCharts(cards);
    }, 200);
  }
  function apply() {
    if (!document.body) return false;
    const leftHeading = findHeading(FIRST);
    const rightHeading = findHeading(SECOND);
    if (!leftHeading || !rightHeading) return false;

    let common = leftHeading.parentElement;
    while (common && !common.contains(rightHeading)) {
      common = common.parentElement;
    }
    if (!common || common === document.body || common === document.documentElement) return false;
    const leftCard = directChild(common, leftHeading);
    const rightCard = directChild(common, rightHeading);
    if (!leftCard || !rightCard || leftCard === rightCard) return false;
    // Never transform an entire dashboard/page into a one-column grid.
    if (common.children.length > 6 || common.tagName === 'MAIN') return false;

    ensureStyles();
    common.classList.add(NAME);
    leftCard.classList.add(NAME + '-card');
    rightCard.classList.add(NAME + '-card');

    // The original page may use inline grid or flex rules.
    common.style.setProperty('display', 'grid', 'important');
    common.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
    common.style.setProperty('gap', '26px', 'important');
    for (const card of [leftCard, rightCard]) {
      card.style.setProperty('width', '100%', 'important');
      card.style.setProperty('max-width', 'none', 'important');
      card.style.setProperty('min-width', '0', 'important');
      card.style.setProperty('grid-column', '1 / -1', 'important');
    }
    const count = leftCard.querySelectorAll('canvas,img,svg').length +
                  rightCard.querySelectorAll('canvas,img,svg').length;
    if (!state.applied || state.charts !== count) scheduleResize([leftCard, rightCard]);
    state.applied = true;
    state.cards = 2;
    state.charts = count;
    return true;
  }
  let checkQueued = false;
  function queueCheck() {
    if (checkQueued) return;
    checkQueued = true;
    setTimeout(() => {
      checkQueued = false;
      apply();
    }, 100);
  }
  function init() {
    apply();
    if (typeof MutationObserver === 'function') {
      new MutationObserver((changes) => {
        if (changes.some((change) => change.addedNodes.length || change.removedNodes.length)) {
          queueCheck();
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('resize', () => {
      if (!apply()) return;
      const parent = document.querySelector('.' + NAME);
      if (parent) scheduleResize(Array.from(parent.children).filter(c => c.classList.contains(NAME + '-card')));
    });
    window.addEventListener('load', queueCheck);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
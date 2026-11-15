/* Compass Bank: remove ONLY the five specified admin research notice boxes.
   This removes matching DOM elements; it does not alter metrics or data. */
(function () {
  'use strict';
  if (window.CompassAdminNoticeRemoval && window.CompassAdminNoticeRemoval.installed) return;

  var signatures = [
    /^research\s+limitation\s*:\s*these\s+models\s+were\s+evaluated\b/i,
    /^research\s+demonstration\s+only\.?\s*these\s+models\s+were\s+trained\b/i,
    /^research\s+demonstration\s+only\.?\s*training\s+and\s+test\s+data\b/i,
    /^research\s+test\s+scenario\s*[-\u2012\u2013\u2014\u2212]\s*not\s+an\s+operational\s+bank\s+forecast\b/i,
    /^research\s+prototype\s*[-\u2012\u2013\u2014\u2212]\s*not\s+a\s+live\s+bank\s+traffic\s+service\b/i
  ];
  var selectors = 'p,div,aside,section,article,li';
  var boundary = { HTML: true, BODY: true, MAIN: true };
  var unsafe = 'form,input,textarea,select,button,table,canvas,iframe,video';

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function isNotice(value) {
    var t = clean(value);
    if (t.length < 45 || t.length > 900) return false;
    return signatures.some(function (pattern) { return pattern.test(t); });
  }
  function isSafe(el) {
    return el && el.nodeType === 1 && !el.matches('script,style') &&
           !el.querySelector(unsafe);
  }
  function selectWholeNotice(el) {
    var notice = el;
    var text = clean(el.textContent);
    // Ascend through wrappers only when they contain EXACTLY the same text.
    // Never remove surrounding cards/pages with extra content.
    for (var i = 0; i < 6; i++) {
      var p = notice.parentElement;
      if (!p || boundary[p.tagName] || !isSafe(p)) break;
      if (clean(p.textContent) !== text) break;
      if (!isNotice(p.textContent)) break;
      notice = p;
    }
    return notice;
  }
  function removeNotices() {
    var elements = Array.prototype.slice.call(document.querySelectorAll(selectors));
    var matches = elements.filter(function (el) {
      return el.isConnected && isSafe(el) && isNotice(el.textContent);
    });
    // Smallest exact matching element first, so parent panels can't swallow
    // adjacent content. Ascend only through identical-text wrappers.
    matches.sort(function (a, b) {
      return clean(a.textContent).length - clean(b.textContent).length;
    });
    var count = 0;
    matches.forEach(function (el) {
      if (!el.isConnected || !isNotice(el.textContent)) return;
      var target = selectWholeNotice(el);
      if (target.isConnected) { target.remove(); count++; }
    });
    window.CompassAdminNoticeRemoval.removed += count;
    return count;
  }
  var pending = false;
  function queueRemoval() {
    if (pending) return;
    pending = true;
    var defer = window.requestAnimationFrame || function (f) { setTimeout(f, 0); };
    defer(function () { pending = false; removeNotices(); });
  }
  function start() {
    removeNotices();
    if (window.MutationObserver && document.documentElement) {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].type === 'characterData' || mutations[i].addedNodes.length) {
            queueRemoval(); return;
          }
        }
      }).observe(document.documentElement, {
        childList: true, subtree: true, characterData: true
      });
    }
  }
  window.CompassAdminNoticeRemoval = {
    installed: true, version: '1.0', removed: 0, run: removeNotices
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else { start(); }
})();
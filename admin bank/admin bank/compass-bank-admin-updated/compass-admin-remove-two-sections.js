/* Compass Bank admin: remove only the two specifically requested explanation cards.
   It does not change or relabel numerical results or research data. */
(function () {
  'use strict';
  if (window.CompassAdminSectionRemoval && window.CompassAdminSectionRemoval.installed) return;

  var targets = [
    {
      name: 'How to interpret the findings',
      title: /^how to interpret the findings$/i,
      checks: [/observed.data experiment/i, /method\s*:/i]
    },
    {
      name: '3. Methodology and limitations for panel defense',
      title: /^(?:3\s*[.)-]\s*)?methodology and limitations for panel defense$/i,
      checks: [/model design/i, /observed limitations/i]
    }
  ];
  var blockedAncestors = { HTML: true, BODY: true, MAIN: true, HEADER: true, NAV: true, FOOTER: true };
  var importantChildren = 'table,canvas,form,iframe,video,img';

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function isHeading(node) {
    return node && node.nodeType === 1 && node.matches('h1,h2,h3,h4,h5,h6,[role="heading"]');
  }
  function looksLikeCard(node) {
    if (node.matches('section,article,aside')) return true;
    var classes = typeof node.className === 'string' ? node.className : '';
    if (/(?:^|[\s_-])(card|panel|rounded|notice|section|box)(?:$|[\s_-])/i.test(classes)) return true;
    if (/(?:border|radius)/i.test(node.getAttribute('style') || '')) return true;
    if (typeof window.getComputedStyle === 'function') {
      var css = window.getComputedStyle(node);
      if (css && parseFloat(css.borderTopWidth) > 0 && css.borderTopStyle !== 'none') return true;
    }
    return false;
  }
  function findExactSection(heading, item) {
    var node = heading.parentElement;
    for (var depth = 0; node && depth < 9; depth++, node = node.parentElement) {
      if (blockedAncestors[node.tagName]) break;
      var text = compact(node.textContent);
      if (text.length > 8000) break;
      if (!item.checks.every(function (test) { return test.test(text); })) continue;
      // Avoid consuming surrounding charts, form widgets, or whole evaluation pages.
      if (node.querySelector(importantChildren)) continue;
      if (node.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]').length > 5) continue;
      if (looksLikeCard(node)) return node;
    }
    return null;
  }
  function removeSections() {
    var removed = 0;
    var headings = Array.prototype.slice.call(
      document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')
    );
    headings.forEach(function (heading) {
      if (!heading.isConnected || !isHeading(heading)) return;
      var title = compact(heading.textContent);
      for (var i = 0; i < targets.length; i++) {
        var item = targets[i];
        if (!item.title.test(title)) continue;
        var card = findExactSection(heading, item);
        if (card && card.isConnected) {
          card.remove();
          removed++;
          window.CompassAdminSectionRemoval.removedTitles.push(item.name);
        }
        break;
      }
    });
    window.CompassAdminSectionRemoval.removed += removed;
    return removed;
  }
  var scheduled = false;
  function queueRemoval() {
    if (scheduled) return;
    scheduled = true;
    var defer = window.requestAnimationFrame || function (callback) { setTimeout(callback, 0); };
    defer(function () { scheduled = false; removeSections(); });
  }
  function start() {
    removeSections();
    if (window.MutationObserver && document.documentElement) {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes.length || mutations[i].type === 'characterData') {
            queueRemoval();
            return;
          }
        }
      }).observe(document.documentElement, {
        subtree: true, childList: true, characterData: true
      });
    }
  }
  window.CompassAdminSectionRemoval = {
    installed: true,
    version: '1.0',
    removed: 0,
    removedTitles: [],
    run: removeSections
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
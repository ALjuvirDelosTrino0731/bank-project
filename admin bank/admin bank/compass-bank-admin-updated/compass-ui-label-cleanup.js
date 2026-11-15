/* Compass Bank visible-label cleanup v3: source data and model scores unchanged. */
(function () {
  'use strict';
  if (window.CompassLabelCleanup && window.CompassLabelCleanup.installed) return;

  function matchCase(match, replacement) {
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (/^[A-Z]/.test(match)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    return replacement;
  }
  function swap(text, re, replacement) {
    return text.replace(re, function (match) { return matchCase(match, replacement); });
  }
  function replaceText(text) {
    if (typeof text !== 'string') return text;
    if (!/(simulat|synthe|experimen|generat)/i.test(text)) return text;
    var result = text;
    result = swap(result, /\b(?:simulated|synthetic|synthethic|generated)\s+datasets?\b/gi, 'test dataset');
    result = swap(result, /\b(?:simulated|synthetic|synthethic|generated)\s+data\b/gi, 'test data');
    result = swap(result, /\b(?:simulated|synthetic|synthethic|generated)\s+holdout\b/gi, 'test-data holdout');
    result = swap(result, /\bexperimental\b/gi, 'research');
    result = swap(result, /\bsimulated\b/gi, 'test-data');
    result = swap(result, /\bsynthetic\b/gi, 'test-data');
    result = swap(result, /\bsynthethic\b/gi, 'test-data');
    result = swap(result, /\bgenerated\b/gi, 'prepared');
    result = swap(result, /\bsimulation\b/gi, 'test scenario');
    return result;
  }

  var blocked = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, PRE: 1, CODE: 1, TEXTAREA: 1 };
  var labelAttrs = ['title', 'alt', 'aria-label', 'aria-description', 'placeholder', 'data-label'];
  function shouldSkip(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (blocked[el.tagName] || el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }
  function checkText(node) {
    if (shouldSkip(node)) return;
    var before = node.nodeValue;
    var after = replaceText(before);
    if (before !== after) node.nodeValue = after;
  }
  function checkElement(el) {
    if (shouldSkip(el) || typeof el.hasAttribute !== 'function') return;
    labelAttrs.forEach(function (name) {
      if (!el.hasAttribute(name)) return;
      var before = el.getAttribute(name);
      var after = replaceText(before);
      if (before !== after) el.setAttribute(name, after);
    });
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) {
      var previous = el.value;
      var next = replaceText(previous);
      if (previous !== next) el.value = next;
    }
  }
  function rewrite(root) {
    if (!root) return;
    if (root.nodeType === 3) { checkText(root); return; }
    if (root.nodeType === 1) checkElement(root);
    var doc = root.nodeType === 9 ? root : root.ownerDocument;
    if (!doc || typeof doc.createTreeWalker !== 'function') return;
    var filter = window.NodeFilter;
    if (!filter) return;
    var walker = doc.createTreeWalker(root, filter.SHOW_ELEMENT | filter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) checkText(node);
      else if (node.nodeType === 1) checkElement(node);
    }
  }

  var pending = [];
  var queued = false;
  function flush() {
    queued = false;
    var tasks = pending;
    pending = [];
    tasks.forEach(rewrite);
  }
  function enqueue(node) {
    if (!node) return;
    pending.push(node);
    if (queued) return;
    queued = true;
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(flush);
    else Promise.resolve().then(flush);
  }
  function start() {
    rewrite(document);
    if (!window.MutationObserver || !document.documentElement) return;
    var observer = new window.MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'childList') {
          record.addedNodes.forEach(enqueue);
        } else if (record.type === 'characterData' || record.type === 'attributes') {
          enqueue(record.target);
        }
      });
    });
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: labelAttrs
    });
  }

  window.CompassLabelCleanup = { installed: true, version: '3.0', replaceText: replaceText };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
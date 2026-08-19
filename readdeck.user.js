// ==UserScript==
// @name         ReadDeck Capture
// @namespace    https://keep.fishese.cc/
// @version      0.1.0
// @description  Save the currently rendered page to your local-first ReadDeck library.
// @author       ReadDeck
// @match        http://*/*
// @match        https://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @downloadURL  https://keep.fishese.cc/readdeck.user.js
// @updateURL    https://keep.fishese.cc/readdeck.user.js
// ==/UserScript==

(() => {
  'use strict';

  const READDECK_URL = 'https://keep.fishese.cc/';
  const CAPTURE_PREFIX = 'readdeck.capture.';

  const absolute = (value, base) => {
    try { return new URL(value, base).href; } catch { return value; }
  };

  const newNonce = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function captureRenderedArticle() {
    const sourceUrl = location.href;
    const canonicalRaw = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
      || document.querySelector('meta[property="og:url"]')?.content
      || sourceUrl;
    const canonical = absolute(canonicalRaw, sourceUrl);
    const title = document.querySelector('meta[property="og:title"]')?.content
      || document.querySelector('h1')?.textContent?.trim()
      || document.title
      || 'Untitled';
    const author = document.querySelector('meta[name="author"]')?.content
      || document.querySelector('[rel="author"]')?.textContent?.trim()
      || '';

    const candidates = [...document.querySelectorAll(
      'article,main,[role="main"],.article,.post,.entry-content,.article-body,.story-body'
    )];
    const best = candidates.sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0] || document.body;
    const clone = best.cloneNode(true);

    clone.querySelectorAll(
      'script,style,noscript,iframe,object,embed,form,input,button,textarea,select,nav,aside,footer,header,'
      + '.advertisement,.advert,.ad,.ads,.cookie,.newsletter,.social-share,.related,.comments'
    ).forEach(el => el.remove());

    clone.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
          el.removeAttribute(attr.name);
          return;
        }
        if (['href', 'src', 'poster', 'xlink:href'].includes(name)) {
          if (/^(?:javascript|vbscript|data:text\/html)/i.test(attr.value.trim())) {
            el.removeAttribute(attr.name);
            return;
          }
          el.setAttribute(attr.name, absolute(attr.value, sourceUrl));
        }
        if (name === 'srcset') {
          const converted = attr.value.split(',').map(part => {
            const bits = part.trim().split(/\s+/);
            if (!bits[0]) return '';
            bits[0] = absolute(bits[0], sourceUrl);
            return bits.join(' ');
          }).filter(Boolean).join(', ');
          if (converted) el.setAttribute('srcset', converted);
          else el.removeAttribute('srcset');
        }
      });
    });

    const text = (clone.textContent || '').trim();
    return {
      title,
      author,
      url: canonical,
      capturedAt: new Date().toISOString(),
      html: clone.innerHTML,
      text,
      archive: null
    };
  }

  async function saveCurrentPage() {
    const payload = captureRenderedArticle();
    if (!payload.html?.trim()) {
      alert('ReadDeck could not find readable content on this page.');
      return;
    }

    const nonce = newNonce();
    await GM_setValue(`${CAPTURE_PREFIX}${nonce}`, JSON.stringify(payload));
    const target = new URL(READDECK_URL);
    target.hash = `readdeck-capture=${encodeURIComponent(nonce)}`;
    GM_openInTab(target.href, { active: true, insert: true, setParent: true });
  }

  async function handOffStoredCapture() {
    const nonce = new URLSearchParams(location.hash.replace(/^#/, '')).get('readdeck-capture');
    if (!nonce) return false;

    const key = `${CAPTURE_PREFIX}${nonce}`;
    const stored = await GM_getValue(key, '');
    if (!stored) return false;

    let payload;
    try { payload = JSON.parse(stored); } catch { return false; }

    const message = {
      source: 'readdeck-extension',
      type: 'readdeck.capture.v1',
      nonce,
      payload
    };

    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      window.postMessage(message, location.origin);

      if (!location.hash.includes(nonce)) {
        clearInterval(timer);
        await GM_deleteValue(key);
      } else if (attempts >= 12) {
        clearInterval(timer);
      }
    }, 500);

    return true;
  }

  const readDeckOrigin = new URL(READDECK_URL).origin;
  if (location.origin === readDeckOrigin) {
    handOffStoredCapture();
    return;
  }

  GM_registerMenuCommand('Save this page to ReadDeck', saveCurrentPage);
})();

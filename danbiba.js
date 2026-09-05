/* ===========================================================================
   Danbiba, page-level behaviour.

   Nothing here touches the engine. The signature move (the loupe and the parcel
   sheet) is plain DOM plus pointer position, and the folio reads section
   boundaries. scrollcraft.js is left exactly as shipped.
   =========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* 'fine' is deliberately not used to gate the loupe. See the pointermove
     handler below for why. */

  /* ---------------------------------------------------------------- i18n --
     233 EN/HA keys are lifted verbatim from the previous site. New copy on this
     build carries its Hausa inline as data-ha. Both swap the same way. */
  var DICT = window.DANBIBA_I18N || {};

  function collect() {
    var nodes = [];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var e = DICT[el.getAttribute('data-i18n')];
      if (e) nodes.push({ el: el, en: e.en, ha: e.ha, attr: null });
    });
    document.querySelectorAll('[data-ha]').forEach(function (el) {
      nodes.push({ el: el, en: el.innerHTML, ha: el.getAttribute('data-ha'), attr: null });
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var e = DICT[el.getAttribute('data-i18n-ph')];
      if (e) nodes.push({ el: el, en: e.en, ha: e.ha, attr: 'placeholder' });
    });
    return nodes;
  }

  var NODES = collect();

  function setLanguage(lang) {
    NODES.forEach(function (n) {
      var v = lang === 'ha' ? n.ha : n.en;
      if (v == null) return;
      if (n.attr) el_setAttr(n.el, n.attr, v); else n.el.innerHTML = v;
    });
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    try { localStorage.setItem('danbiba-lang', lang); } catch (e) {}
  }
  function el_setAttr(el, a, v) { el.setAttribute(a, v.replace(/<[^>]*>/g, '')); }

  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () { setLanguage(b.getAttribute('data-lang')); });
  });
  /* Always apply a language on load, including English. Object labels on the
     catalog pages carry only a data-i18n key and no inline text, so skipping
     the English pass leaves every label blank. */
  var saved = 'en';
  try { saved = localStorage.getItem('danbiba-lang') === 'ha' ? 'ha' : 'en'; } catch (e) {}
  setLanguage(saved);

  /* ------------------------------------------------- index of objects --
     The catalog grammar's nav is an index, and an index has to jump. The
     objects live in a rail driven by page scroll, so a jump is a scroll
     position: how far the act has to travel to bring that object to the left
     edge of the stage. */
  var jumpBtns = document.querySelectorAll('[data-jump]');
  if (jumpBtns.length) {
    var act = document.querySelector('[data-sc-act="pan"]');
    var railEl = document.getElementById('plates');
    jumpBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-jump'), 10);
        var obj = document.getElementById('object-' + i);
        if (!act || !railEl || !obj) return;
        var overflow = railEl.scrollWidth - window.innerWidth;
        if (overflow <= 0) { obj.scrollIntoView({ block: 'center' }); return; }
        /* offsetLeft is measured inside the untransformed rail, so it is the
           travel needed regardless of where the rail currently sits. */
        var want = Math.min(Math.max(obj.offsetLeft - window.innerWidth * 0.12, 0), overflow);
        var travel = act.offsetHeight - window.innerHeight;
        window.scrollTo({ top: act.offsetTop + travel * (want / overflow), behavior: 'smooth' });
      });
    });

    /* mark where the reader actually is */
    if ('IntersectionObserver' in window) {
      var mark = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          var id = e.target.id.replace('object-', '');
          jumpBtns.forEach(function (b) {
            b.setAttribute('aria-current', String(b.getAttribute('data-jump') === id));
          });
        });
      }, { root: null, rootMargin: '0px -55% 0px -10%', threshold: 0.2 });
      document.querySelectorAll('[id^="object-"]').forEach(function (o) { mark.observe(o); });
    }
  }

  /* --------------------------------------------------------------- folio --
     The chrome says where in the feature the reader is. It is a folio, not a
     progress bar, so it names the chapter rather than counting percent. */
  var numEl = document.querySelector('[data-folio-num]');
  var titleEls = [
    document.querySelector('[data-folio-title]'),
    document.querySelector('[data-folio-title-desktop]')
  ].filter(Boolean);

  var chapters = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
  if (chapters.length && 'IntersectionObserver' in window) {
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        if (el === current) return;
        current = el;
        if (numEl) numEl.textContent = el.getAttribute('data-chapter');
        var name = el.getAttribute('data-chapter-name') || '';
        titleEls.forEach(function (t) { t.textContent = name; });
        /* The folio floats over the chapter grounds, so it has to take its ink
           from whichever stock is behind it or it goes invisible on the insert. */
        var onPaper = el.classList.contains('stock--paper');
        var folio = document.querySelector('.folio');
        if (folio) folio.classList.toggle('folio--on-paper', onPaper);
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    chapters.forEach(function (c) { io.observe(c); });
  }

  /* ------------------------------------------------- the loupe + parcel --
     Drag across a plate: the stone renders at inspection magnification with a
     reading under the glass. Inspecting a stone stamps it onto a parcel sheet
     in the folio, and the sheet is what the minerals desk enquiry is built
     from. The state outlives the act, which is the point of it. */
  var ZOOM = 2.7;
  var parcelBox = document.getElementById('parcel');
  var parcelList = document.getElementById('parcel-list');
  var deskLink = document.getElementById('minerals-desk');
  var noted = [];

  function stamp(name) {
    if (noted.indexOf(name) !== -1) return;
    noted.push(name);
    if (parcelBox) parcelBox.hidden = false;
    if (parcelList) {
      var li = document.createElement('li');
      var b = document.createElement('b'); b.textContent = name;
      var s = document.createElement('span'); s.textContent = 'noted';
      li.appendChild(b); li.appendChild(s);
      parcelList.appendChild(li);
    }
    if (deskLink) {
      var body = 'I would like parcel sizes, grading reports and export '
        + 'documentation for: ' + noted.join(', ') + '.';
      deskLink.href = 'mailto:danbiba2008@outlook.com'
        + '?subject=' + encodeURIComponent('Minerals desk enquiry: ' + noted.join(', '))
        + '&body=' + encodeURIComponent(body);
    }
  }

  document.querySelectorAll('.plate__frame').forEach(function (frame) {
    var stone = frame.getAttribute('data-stone');
    var src = frame.getAttribute('data-src');
    var article = frame.closest('.plate');
    var grade = article ? article.querySelector('[data-grade]') : null;

    frame.setAttribute('tabindex', '0');
    frame.setAttribute('role', 'button');
    frame.setAttribute('aria-label', 'Inspect ' + stone + ' under the loupe');

    function open() {
      if (grade) grade.classList.add('is-open');
      stamp(stone);
    }

    /* Reduced motion: no magnification, the grading card is simply present. */
    if (reduce) { open(); return; }

    frame.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });

    var loupe = document.createElement('div');
    loupe.className = 'loupe';
    loupe.setAttribute('aria-hidden', 'true');
    loupe.style.backgroundImage = 'url("' + src + '")';
    var read = document.createElement('span');
    read.className = 'loupe__read';
    read.textContent = stone;
    loupe.appendChild(read);
    frame.appendChild(loupe);

    var travelled = 0, last = null, raf = 0, pending = null;

    function paint() {
      raf = 0;
      if (!pending) return;
      var r = frame.getBoundingClientRect();
      var x = pending.x, y = pending.y;
      var w = loupe.offsetWidth, h = loupe.offsetHeight;
      loupe.style.left = x + 'px';
      loupe.style.top = y + 'px';
      loupe.style.backgroundSize = (r.width * ZOOM) + 'px ' + (r.height * ZOOM) + 'px';
      loupe.style.backgroundPosition =
        (-(x * ZOOM - w / 2)) + 'px ' + (-(y * ZOOM - h / 2)) + 'px';
    }

    function move(e) {
      var r = frame.getBoundingClientRect();
      /* Travel is measured in VIEWPORT coordinates, not frame-relative ones.
         The rail pans while the reader scrolls, so a frame-relative delta grows
         under a completely stationary pointer and would stamp stones nobody
         chose to look at. The loupe still positions frame-relative. */
      if (last) travelled += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      pending = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!raf) raf = requestAnimationFrame(paint);
      /* Inspection is travel, not a hover. A pointer crossing the plate on its
         way somewhere else has not inspected anything. */
      if (travelled > 90) open();
    }

    /* The loupe is raised by the pointer actually being here, not by a
       hover:hover media query. Gating visibility on the query left the
       magnification computed and invisible on any pointer the query does not
       claim, which is a silent failure: every still frame looks correct. */
    frame.addEventListener('pointerleave', function () {
      frame.classList.remove('is-inspecting');
      last = null;
    });
    frame.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      frame.classList.add('is-inspecting');
      move(e);
    });

    /* Touch: the loupe follows the finger while it is down, and a tap opens the
       grading card. The move is not desktop-only. */
    frame.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch') return;
      frame.classList.add('is-inspecting');
      move(e);
    });
    frame.addEventListener('pointerup', function (e) {
      if (e.pointerType !== 'touch') return;
      frame.classList.remove('is-inspecting');
      last = null;
      open();
    });
    frame.addEventListener('click', function () { open(); });
  });

  /* Rail overflow is width-dependent and the harness does not catch a rail that
     is narrower than the viewport, so it is asserted here in the console. */
  var rail = document.getElementById('plates');
  if (rail) {
    requestAnimationFrame(function () {
      var overflow = rail.scrollWidth - window.innerWidth;
      if (overflow < window.innerWidth * 0.5) {
        console.warn('[danbiba] plate rail overflow is only ' + overflow
          + 'px. The pan act will barely travel.');
      } else {
        console.info('[danbiba] plate rail overflow ' + overflow + 'px.');
      }
    });
  }
})();

/* The enquiry form composes a mailto, exactly as the previous site did. There is
   no backend here, and pretending otherwise would be a fake form. */
(function () {
  var form = document.getElementById('enquiry');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var track = v('f-track') || 'Enquiry';
    var body = [
      'Name: ' + v('f-name'),
      'Organization: ' + v('f-org'),
      'Email: ' + v('f-email'),
      'Track: ' + track,
      '',
      v('f-msg')
    ].join('\n');
    window.location.href = 'mailto:danbiba2008@outlook.com'
      + '?subject=' + encodeURIComponent(track + ' enquiry: ' + (v('f-org') || v('f-name')))
      + '&body=' + encodeURIComponent(body);
  });
})();

/* Fleet gallery filters. The original site filtered by division and the rebuild
   dropped it; this restores it. Filtering hides list items rather than
   rebuilding the DOM, so the reveal-on-entry state is not lost. */
(function () {
  var tabs = document.querySelectorAll('.fleet-tabs button');
  var items = document.querySelectorAll('.fleet-item');
  var empty = document.getElementById('fleet-empty');
  if (!tabs.length || !items.length) return;

  function apply(filter) {
    var shown = 0;
    items.forEach(function (li) {
      var match = filter === 'all' || li.getAttribute('data-division') === filter;
      li.hidden = !match;
      if (match) shown++;
    });
    tabs.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === filter));
    });
    if (empty) empty.hidden = shown !== 0;
  }

  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      apply(b.getAttribute('data-filter'));
      /* act heights change when rows disappear, so the engine has to re-measure
         or every act below this one is scored against a stale layout */
      (window.ScrollCraft && ScrollCraft.instances || []).forEach(function (api) {
        if (api && api.layout) api.layout();
      });
    });
  });
})();

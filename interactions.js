/* ===========================================================================
   Danbiba, interaction layer.

   v1 put everything behind a click, which is why the pages still felt inert:
   a reader scrolls and hovers, and neither did much. This version drives the
   motion from those two inputs and keeps the click affordances on top.

   Every transform composes from CSS custom properties. That is what lets the
   pointer and the scroll drive one element without overwriting each other's
   transform, which is the usual way this kind of thing breaks. Engine
   untouched, as ever.
   =========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };


  /* =======================================================================
     0. PHONE LAYOUT CORRECTIONS
     These run BEFORE ScrollCraft.mount, because they change what the engine
     sees rather than what it does afterwards.

     A horizontal rail is unusable at phone width: a 296px card in a 390px
     viewport means one card is always sliced at an edge and adjacent labels
     collide. And a pinned closing stage clips 100px off the bottom of its own
     footer, then leaves a screen of empty dark to scroll past. Both become
     ordinary stacked sections on a phone.
     ======================================================================= */
  if (window.matchMedia('(max-width: 760px)').matches) {
    var unpin = function (el) {
      if (!el) return;
      el.removeAttribute('data-sc-act');
      el.removeAttribute('data-sc-span');
      el.classList.add('is-stacked');
      /* Cues and wipes are driven by act progress. With no act they would
         never run, leaving the content at opacity 0 or clipped to nothing. */
      each(el.querySelectorAll('[data-sc-cue]'), function (n) {
        n.removeAttribute('data-sc-cue'); n.removeAttribute('data-sc-rise');
      });
      each(el.querySelectorAll('[data-sc-reveal]'), function (n) {
        n.removeAttribute('data-sc-reveal'); n.removeAttribute('data-sc-reveal-at');
      });
      each(el.querySelectorAll('[data-sc-pan]'), function (n) {
        n.removeAttribute('data-sc-pan');
      });
    };
    each(document.querySelectorAll('[data-sc-act="pan"]'), unpin);
    unpin(document.getElementById('desk'));
  }

  /* =======================================================================
     1. RISE
     A scroll entrance on nearly everything that carries meaning, staggered
     within its own parent so a section assembles rather than just appearing.
     Applied from here so no page markup has to change.
     ======================================================================= */
  if (!reduce && 'IntersectionObserver' in window) {
    var GROUPS = [
      ['.prose > p', 'rise'],
      ['.chapter__head', 'side'],
      ['.stages > li', 'rise'],
      ['.marginalia dt', 'side'],
      ['.marginalia dd', 'side'],
      ['.readon a', 'rise'],
      ['.fleet-item', 'lift'],
      ['.object', 'lift'],
      ['.plate', 'lift'],
      ['.ground__cap', 'rise'],
      ['.colophon__cols > div', 'rise'],
      ['.colophon__tagline', 'rise'],
      ['.byline span', 'rise'],
      ['.fleet-tabs button', 'rise'],
      ['.stage-jump li', 'rise']
    ];

    var rise = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        rise.unobserve(e.target);       /* fires once; re-hiding on scroll-up is a defect */
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });

    GROUPS.forEach(function (g) {
      var seen = null, i = 0;
      each(document.querySelectorAll(g[0]), function (el) {
        if (el.hasAttribute('data-rise')) return;
        if (el.parentNode !== seen) { seen = el.parentNode; i = 0; }
        el.setAttribute('data-rise', g[1]);
        el.style.setProperty('--i', String(Math.min(i, 7)));
        i++;
        rise.observe(el);
      });
    });
  }

  /* =======================================================================
     2. THREE DIMENSIONS
     Pointer tilt with a specular sheen, plus a scroll-driven rotation on rail
     items so travelling past them reads as depth rather than as sliding.
     ======================================================================= */
  var TILTABLE = '.plate__frame, .object__crop, .fleet-item__crop';
  var tilted = document.querySelectorAll(TILTABLE);
  each(tilted, function (el) { el.classList.add('tilt3d'); });

  /* Deliberately NOT gated on `fine`. The loupe had exactly this bug: a
     hover:hover query does not claim every real pointer, and the failure is
     silent because a still screenshot of an untilted card looks correct. Touch
     is excluded by pointerType instead, which is the honest test. */
  if (!reduce) {
    each(tilted, function (el) {
      var raf = 0, pend = null;

      function paint() {
        raf = 0;
        if (!pend) return;
        el.style.setProperty('--ry', (pend.x * 13).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (pend.y * -10).toFixed(2) + 'deg');
        el.style.setProperty('--tz', '14px');
        el.style.setProperty('--mx', (50 + pend.x * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (50 + pend.y * 100).toFixed(1) + '%');
      }

      el.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = el.getBoundingClientRect();
        pend = { x: (e.clientX - r.left) / r.width - 0.5,
                 y: (e.clientY - r.top) / r.height - 0.5 };
        el.classList.add('is-pointing');
        if (!raf) raf = requestAnimationFrame(paint);
      });
      el.addEventListener('pointerleave', function () {
        el.classList.remove('is-pointing');
        pend = null;
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--tz', '0px');
      });
    });
  }

  /* Rail items turn toward the reader as they cross the middle of the screen.
     This is the part that makes moving through a collection feel like moving
     rather than like a slideshow on rails. */
  var railItems = document.querySelectorAll('.plates .plate__frame, .collection .object__crop');
  if (railItems.length && !reduce) {
    var ticking = false;
    function spin() {
      ticking = false;
      var mid = window.innerWidth / 2;
      each(railItems, function (el) {
        var r = el.getBoundingClientRect();
        if (r.right < -200 || r.left > window.innerWidth + 200) return;
        var d = ((r.left + r.width / 2) - mid) / mid;
        d = Math.max(-1.4, Math.min(1.4, d));
        el.style.setProperty('--sry', (d * -11).toFixed(2) + 'deg');
        el.style.setProperty('--sc', (1 - Math.abs(d) * 0.045).toFixed(3));
      });
    }
    var onScroll = function () {
      if (!ticking) { ticking = true; requestAnimationFrame(spin); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    spin();
  }

  /* =======================================================================
     3. PARCEL SHEET
     It used to sit open over the page and clip whatever it landed on. It is a
     control in the bar now, opaque, and closed until it is asked for.
     ======================================================================= */
  var sheet = document.getElementById('parcel');
  var bar = document.querySelector('.folio');
  if (sheet && bar) {
    var lang = bar.querySelector('.folio__lang');
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'parcel-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = 'Parcel <span class="n">0</span>';
    if (lang) bar.insertBefore(toggle, lang); else bar.appendChild(toggle);

    var count = toggle.querySelector('.n');
    sheet.hidden = true;

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = sheet.hidden;
      sheet.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (sheet.hidden) return;
      if (sheet.contains(e.target) || toggle.contains(e.target)) return;
      sheet.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !sheet.hidden) {
        sheet.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    var list = document.getElementById('parcel-list');
    if (list && 'MutationObserver' in window) {
      new MutationObserver(function () {
        var n = list.children.length;
        count.textContent = String(n);
        toggle.classList.toggle('is-live', n > 0);
        if (!reduce && n > 0) {
          count.classList.remove('is-bump');
          void count.offsetWidth;
          count.classList.add('is-bump');
        }
        sheet.hidden = true;    /* stamping must not fling it open over the copy */
        toggle.setAttribute('aria-expanded', 'false');
      }).observe(list, { childList: true });
    }
  }

  /* =======================================================================
     4. LIGHTBOX
     Every plate, object and machine opens large with its own label, and the
     arrow keys walk the collection.
     ======================================================================= */
  var GROUPSET = [
    { sel: '.plate', crop: '.plate__frame', title: '.plate__name',
      note: '.plate__cap', schema: '[data-grade]', kicker: '.plate__type' },
    { sel: '.object', crop: '.object__crop', title: '.object__name',
      note: '.object__note', schema: '.schema', kicker: null },
    { sel: '.fleet-item', crop: '.fleet-item__crop', title: '.fleet-item__name',
      note: null, schema: '.schema', kicker: null }
  ];

  var items = [];
  GROUPSET.forEach(function (g) {
    each(document.querySelectorAll(g.sel), function (el) {
      var crop = el.querySelector(g.crop);
      var img = crop && crop.querySelector('img');
      if (crop && img) items.push({ el: el, crop: crop, img: img, g: g });
    });
  });

  if (items.length && typeof HTMLDialogElement !== 'undefined') {
    var dlg = document.createElement('dialog');
    dlg.className = 'lb';
    dlg.innerHTML =
      '<div class="lb__inner">' +
        '<figure class="lb__figure"><img alt="" width="900" height="1200"></figure>' +
        '<div class="lb__body">' +
          '<p class="lb__kicker"></p>' +
          '<h2 class="lb__title"></h2>' +
          '<p class="lb__note"></p>' +
          '<div class="lb__schema"></div>' +
        '</div>' +
      '</div>' +
      '<button class="lb__prev" type="button" aria-label="Previous">←</button>' +
      '<button class="lb__next" type="button" aria-label="Next">→</button>' +
      '<button class="lb__close" type="button" aria-label="Close">×</button>' +
      '<p class="lb__count"></p>';
    document.body.appendChild(dlg);

    var q = function (s) { return dlg.querySelector(s); };
    var at = 0;

    function show(i) {
      at = (i + items.length) % items.length;
      var it = items[at];
      var img = q('.lb__figure img');
      img.src = it.img.currentSrc || it.img.src;
      img.alt = it.img.alt || '';
      var w = it.img.getAttribute('width'), h = it.img.getAttribute('height');
      if (w && h) { img.setAttribute('width', w); img.setAttribute('height', h); }
      img.style.width = '100%'; img.style.height = 'auto';
      var t = it.g.title ? it.el.querySelector(it.g.title) : null;
      var n = it.g.note ? it.el.querySelector(it.g.note) : null;
      var k = it.g.kicker ? it.el.querySelector(it.g.kicker) : null;
      var s = it.g.schema ? it.el.querySelector(it.g.schema) : null;
      q('.lb__title').textContent = t ? t.textContent.trim() : '';
      q('.lb__note').textContent = n ? n.textContent.trim() : '';
      q('.lb__kicker').textContent = k ? k.textContent.trim() : '';
      q('.lb__schema').innerHTML = s ? s.outerHTML : '';
      var clone = q('.lb__schema').firstElementChild;
      if (clone) {
        clone.classList.add('is-open');
        clone.removeAttribute('data-grade');
        clone.removeAttribute('style');
        /* the copy may carry rise state from the page; it must not arrive
           invisible inside a dialog that just opened */
        each(clone.querySelectorAll('[data-rise]'), function (el) {
          el.removeAttribute('data-rise');
          el.classList.add('is-in');
        });
      }
      q('.lb__count').textContent = (at + 1) + ' / ' + items.length;
    }

    items.forEach(function (it, i) {
      it.crop.addEventListener('click', function () {
        show(i);
        if (!dlg.open) dlg.showModal();
      });
    });
    q('.lb__close').addEventListener('click', function () { dlg.close(); });
    q('.lb__prev').addEventListener('click', function () { show(at - 1); });
    q('.lb__next').addEventListener('click', function () { show(at + 1); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
    });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) dlg.close();
    });

    /* the enlarged plate tilts too, so the lightbox is not a dead end */
    if (!reduce) {
      var fig = q('.lb__figure');
      fig.classList.add('tilt3d');
      dlg.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = fig.getBoundingClientRect();
        var x = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width - 0.5));
        var y = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height - 0.5));
        fig.classList.add('is-pointing');
        fig.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
        fig.style.setProperty('--rx', (y * -7).toFixed(2) + 'deg');
        fig.style.setProperty('--mx', (50 + x * 90).toFixed(1) + '%');
        fig.style.setProperty('--my', (50 + y * 90).toFixed(1) + '%');
      });
    }
  }

  /* =======================================================================
     5. DISCLOSURE REGISTRY. The original site opened and closed these.
     ======================================================================= */
  each(document.querySelectorAll('.stages--disclose > li'), function (li, i) {
    var h = li.querySelector('h3');
    var p = li.querySelector('p');
    if (!h || !p) return;
    if (!p.querySelector('span')) p.innerHTML = '<span>' + p.innerHTML + '</span>';
    h.setAttribute('tabindex', '0');
    h.setAttribute('role', 'button');
    h.setAttribute('aria-expanded', i === 0 ? 'true' : 'false');
    if (i === 0) li.classList.add('is-open');
    function flip() {
      var open = !li.classList.contains('is-open');
      li.classList.toggle('is-open', open);
      h.setAttribute('aria-expanded', String(open));
    }
    h.addEventListener('click', flip);
    h.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
  });

  /* =======================================================================
     6. STAGE INDEX. It said where you could go, never where you were.
     ======================================================================= */
  var jumps = document.querySelectorAll('.stage-jump a');
  if (jumps.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = '#' + e.target.id;
        each(jumps, function (a) {
          a.setAttribute('aria-current', String(a.getAttribute('href') === id));
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    for (var i = 1; i <= 5; i++) {
      var sec = document.getElementById('stage-' + i);
      if (sec) io.observe(sec);
    }
  }

  /* =======================================================================
     7. THE HERO
     Nothing here any more. The hero used to be a photograph on a hinge: this
     block read the pointer into --px/--py and the CSS spent them on
     transforms. It is now real geometry under a real camera, owned by
     farm-scene.js, and a second thing moving the same pixels would only
     fight it.
     ======================================================================= */
})();

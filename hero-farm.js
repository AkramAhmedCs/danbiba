/* ===========================================================================
   HERO LOADER
   ---------------------------------------------------------------------------
   Decides whether the 3D farm can and should run, and only then pulls in the
   ~180 KB gzipped of three.js.

   The photograph in the markup is a fallback and nothing else. It carries no
   src until this file gives it one, for two reasons: with one it appeared for
   a moment before the scene was ready — the old hero flashing past the new
   one — and, being a 364 KB image, it competed for bandwidth with the very
   bundle that was going to replace it.

   So it is fetched in exactly three cases: WebGL is unavailable, the module
   fails to load, or the scene is taking long enough that a blank hero would
   be worse than a brief photograph.
   =========================================================================== */

const host = document.querySelector('[data-farm]');

if (host) {
  const still = host.querySelector('.farm__still');
  let slowTimer = 0;

  function showStill() {
    if (still && !still.getAttribute('src')) {
      if (still.dataset.srcset) still.srcset = still.dataset.srcset;
      still.src = still.dataset.src;
    }
    host.classList.add('is-fallback');
  }
  function hideStill() {
    clearTimeout(slowTimer);
    host.classList.remove('is-fallback');
  }

  const hasWebGL = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
                (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  })();

  if (!hasWebGL) {
    host.classList.add('is-static');
    showStill();
  } else {
    /* Nothing loads until the hero is actually approaching the viewport. On a
       cold visit that is immediately, but it keeps the bundle off the critical
       path either way. */
    let started = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some(e => e.isIntersecting) || started) return;
      started = true;
      io.disconnect();
      boot();
    }, { rootMargin: '200px' });
    io.observe(host);
  }

  async function boot() {
    /* A fast connection never sees this. A slow one gets the photograph
       rather than a bare gradient, and it is dropped again the moment the
       geometry stands up. */
    slowTimer = setTimeout(showStill, 1400);

    let mod;
    try {
      mod = await import('./farm-scene.js');
    } catch (err) {
      showStill();
      host.classList.add('is-static');
      console.warn('[farm] scene failed to load, holding the still', err);
      return;
    }

    const release = host.querySelector('.farm__release');

    const farm = mod.mountFarmScene(host, {
      onActivate(on) {
        /* On a touch screen an activated scene owns the swipe, so there has
           to be a way back to the page that is not "guess". */
        if (release) release.hidden = !(on && matchMedia('(pointer: coarse)').matches);
      }
    });

    hideStill();

    if (release) {
      release.addEventListener('click', () => {
        farm.release();
        release.hidden = true;
      });
    }

    /* the harness in lab/ drives the camera through this */
    window.__farm = farm;
    host.dispatchEvent(new CustomEvent('farm:ready', { bubbles: true }));
  }
}

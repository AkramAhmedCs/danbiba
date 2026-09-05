# Danbiba Farms & Mining Co. Ltd — website

A static site. No build step, no server, no dependencies to install. Upload
this folder and it works.

## Contents

```
index.html         home. The farm on the front page is a real 3D scene.
minerals.html      eight-stone portfolio, grading, how to buy
produce.html       ten produce lines, each with its own field photograph
fleet.html         sixteen machines, filterable by division
operations.html    the five lifecycle stages
governance.html    disclosure registry, values, mission, vision
contact.html       three partnership desks

scrollcraft.css    scroll engine styles      (do not edit)
scrollcraft.js     scroll engine             (do not edit)
danbiba.css        this site's design system
danbiba.js         language toggle, loupe, parcel sheet, catalog index
i18n.js            233 EN/HA translation pairs
interactions.js    phone layout, scroll entrances, lightbox, accordion
farm-scene.js      the 3D farm: geometry, lighting, camera  <- tunable
hero-farm.js       decides whether to load it, and loads it
vendor/three/      three.js r180 and OrbitControls          (do not edit)
assets/            images (WebP)
```

About 9 MB, of which 0.7 MB is three.js.

## Deploying

Anything that serves static files works. `index.html` must sit at the root of
whatever you upload, not inside a subfolder. There is no build command and no
output directory; if a host asks, leave both blank.

One requirement: the host must serve `.js` files as `text/javascript`. Every
normal host does. If the 3D farm does not appear but the photograph does, that
is the first thing to check.

## The farm on the front page

It is a WebGL scene. The barn, silo, fields, fences, crop rows, trees and
tractor are built out of three.js primitives when the page loads, and the
graphics card draws them fresh every frame. Nothing about it is a picture.

- **Drag** to orbit. **Scroll** to zoom, but only once you have clicked into
  the scene — before that the wheel belongs to the page, so the site scrolls
  normally. **Right-drag** pans, clamped so you cannot slide off the plot.
- It **drifts slowly on its own**, stops the moment you touch it, and starts
  again about four seconds after you stop.
- The camera **cannot go below the ground**, cannot get inside the barn, and
  cannot pull back into empty space.
- **On a phone**, one finger scrolls the page as usual until you tap the
  scene. After that one finger orbits and a **Done** button gives the page
  back. Pinch zooms.
- **Keyboard**: tab to it, arrow keys orbit, `+` and `-` zoom, `Escape`
  releases it.
- It **stops rendering entirely** when scrolled out of view or when the tab is
  in the background.
- If WebGL is unavailable, or the visitor has asked their system for reduced
  motion, it **falls back to the photograph** or holds still rather than
  drifting. It never leaves an empty box.

### Changing it

Everything worth adjusting is in the `CONFIG` object at the top of
`farm-scene.js` — plot size, every colour, where the barn and silo stand, how
many crop rows, tree positions, the camera's opening view and its limits.
Edit and reload; there is nothing to rebuild.

The scene is organised into named groups (`ground`, `fields`, `crops`,
`fences`, `trees`, `barn`, `silo`, `tank`, `bales`, `tractor`), each built by
its own function further down the file.

**Performance as measured on this build:** 47 draw calls, about 10,600
triangles, 0.34 ms per frame on a desktop GPU — roughly a twentieth of the
16.7 ms a 60 fps frame allows. Crop rows are one `InstancedMesh`, so all
~1,400 plants cost a single draw call; on phones that count drops to ~520 and
the shadow map halves.

## How the phone layout differs, and why

Below 760px the horizontal rails on the home, minerals and products pages
become ordinary stacked sections, one card per row, and the closing section
stops being pinned.

This is deliberate. A rail card is about 296px wide, and in a 390px viewport
that means a card is always sliced in half at one edge with the labels of two
cards overlapping. The pinned close had the same class of problem: its content
is taller than a phone screen, so a fixed-height stage clipped 100px off the
bottom of its own footer and then left a screen of empty dark to scroll past.

The conversion happens in `interactions.js` before the engine starts, because
it changes what the engine sees rather than what it does afterwards.

## Editing

- **Text** lives in `i18n.js` for anything carrying a `data-i18n` key, and
  inline in the HTML for anything carrying `data-ha`. Both languages sit
  together, so they cannot drift apart.
- **Colour and type** are the token block at the top of `danbiba.css`. Six
  colours and two typefaces control the whole site. The 3D scene keeps its own
  palette in `farm-scene.js`, matched to those tokens by hand — change one and
  the other will want changing too.
- **Images** are WebP in `assets/`. Replace a file with one of the same name
  and the same shape and nothing else needs touching.

## Before this goes live

Four things are still unverified, listed in full in the build folder under
`review/`:

1. **Site locations.** The copy says "separate sites" rather than naming
   places, because only the Nyaya office address is documented.
2. **Hausa.** 110 strings are drafted and need a native speaker
   (`review/hausa-review.csv`).
3. **Seven numeric claims** carried over from the current site, none evidenced
   (`review/figures-to-verify.md`). "94% spatial accuracy" and "150 operational
   hours" are the two a buyer will test first.
4. **The logo.** The version in the company profile PDF carries a visible
   "Meta AI" watermark, so no logo is used. A clean vector is needed.

A fifth, smaller one: the 3D farm is a **stylised model, not a survey**. It is
deliberately low-poly so nobody can mistake it for a photograph of Danbiba's
actual land, and it carries no claim about acreage, layout or crop mix.

## A note on the forms

The contact and partnership forms open the visitor's own email client with the
details filled in. Nothing is submitted to a server, because there is no
server. If you want submissions to arrive in an inbox instead, that needs a
form service, and the host you choose may include one.

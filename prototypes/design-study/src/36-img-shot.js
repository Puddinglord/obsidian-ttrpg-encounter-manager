/* ============================================================================
   A screenshot of the real plugin as a shot, for surfaces that were designed in
   the plugin first (the compendium, builders, dialogs). The PNGs live in
   prototypes/design-study/shots/ (our own UI and sample content only).
     { device: 'img', src: 'design-study/shots/nimble-compendium-720.png', w: 720, cap, sub }
   ========================================================================== */
mainShot = (orig => (def, m) => {
	if (m.device !== 'img') return orig(def, m);
	return h('div.dev-wrap', h('img.dev-img', { src: m.src, alt: m.cap, style: { width: (m.w || 720) + 'px', maxWidth: '100%' } }), h('div.dev-cap', h('b', m.cap), m.sub || null));
})(mainShot);

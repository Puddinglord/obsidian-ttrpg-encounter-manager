// The changelog: copy a release's link, and mark the release you're reading in the list.
(function () {
	document.addEventListener('click', function (e) {
		var btn = e.target.closest && e.target.closest('.cl-copy');
		if (!btn) return;
		var url = btn.getAttribute('data-url');
		var done = function () {
			var label = btn.querySelector('span');
			btn.classList.add('is-done');
			if (label) label.textContent = 'Link copied';
			setTimeout(function () { btn.classList.remove('is-done'); if (label) label.textContent = 'Copy link'; }, 1800);
		};
		if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link', url); });
		else window.prompt('Copy this link', url);
	});

	var links = Array.prototype.slice.call(document.querySelectorAll('.cl-toc a'));
	if (!links.length || !('IntersectionObserver' in window)) return;
	var byId = {};
	links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
	var io = new IntersectionObserver(function (entries) {
		entries.forEach(function (en) {
			if (!en.isIntersecting) return;
			links.forEach(function (a) { a.classList.remove('is-current'); });
			var a = byId[en.target.id];
			if (a) a.classList.add('is-current');
		});
	}, { rootMargin: '-30% 0px -60% 0px' });
	document.querySelectorAll('.cl-release').forEach(function (r) { io.observe(r); });
})();

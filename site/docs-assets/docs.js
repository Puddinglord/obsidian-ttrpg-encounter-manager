// Ember Vault user guide: mobile menu, "On this page" scroll-spy, copy buttons and search.
(function () {
	'use strict';
	var doc = document.documentElement;
	var body = document.body;

	/* ---------- Mobile menu ---------- */
	var menuBtn = document.querySelector('.menu-btn');
	var sidebar = document.getElementById('sidebar');
	var scrim = document.querySelector('.scrim');
	function setMenu(open) {
		body.classList.toggle('nav-open', open);
		menuBtn.setAttribute('aria-expanded', String(open));
		scrim.hidden = !open;
		if (open) (sidebar.querySelector('[aria-current]') || sidebar.querySelector('a')).focus({ preventScroll: true });
		else menuBtn.focus({ preventScroll: true });
	}
	if (menuBtn && sidebar && scrim) {
		menuBtn.addEventListener('click', function () { setMenu(!body.classList.contains('nav-open')); });
		scrim.addEventListener('click', function () { setMenu(false); });
		sidebar.addEventListener('click', function (e) { if (e.target.closest('a') && body.classList.contains('nav-open')) body.classList.remove('nav-open'), scrim.hidden = true; });
		document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && body.classList.contains('nav-open')) setMenu(false); });
		var current = sidebar.querySelector('[aria-current]');
		if (current && current.scrollIntoView && current.getBoundingClientRect().bottom > innerHeight - 40) current.scrollIntoView({ block: 'center' });
	}

	/* ---------- Scroll-spy for "On this page" ---------- */
	var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]:not(.to-top)'));
	var heads = tocLinks.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
	var spyQueued = false;
	function spy() {
		spyQueued = false;
		var offset = parseFloat(getComputedStyle(doc).scrollPaddingTop) || 90;
		var active = -1;
		for (var i = 0; i < heads.length; i++) if (heads[i] && heads[i].getBoundingClientRect().top <= offset + 8) active = i;
		if (innerHeight + scrollY >= doc.scrollHeight - 4 && heads.length) active = heads.length - 1;
		if (active < 0 && heads.length) active = 0;
		tocLinks.forEach(function (a, j) {
			a.classList.toggle('is-active', j === active);
			if (j === active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
		});
	}
	if (tocLinks.length) {
		addEventListener('scroll', function () { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } }, { passive: true });
		addEventListener('resize', spy);
		spy();
	}

	/* ---------- Copy buttons on code ---------- */
	document.querySelectorAll('.code-card').forEach(function (card) {
		var bar = card.querySelector('.code-bar');
		var code = card.querySelector('code');
		if (!bar || !code || !navigator.clipboard) return;
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'copy';
		btn.textContent = 'Copy';
		btn.addEventListener('click', function () {
			navigator.clipboard.writeText(code.textContent).then(function () {
				btn.textContent = 'Copied';
				btn.classList.add('is-done');
				setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('is-done'); }, 1600);
			});
		});
		bar.appendChild(btn);
	});

	/* ---------- Search ---------- */
	var dlg = document.getElementById('search');
	var openBtn = document.querySelector('.search-btn');
	if (!dlg || !openBtn || typeof dlg.showModal !== 'function') return;
	var input = document.getElementById('search-input');
	var list = document.getElementById('search-results');
	var empty = dlg.querySelector('.search-empty');
	var entries = null, loading = null, results = [], sel = -1;

	function load() {
		if (!loading) {
			loading = fetch(dlg.getAttribute('data-index') || 'search-index.json').then(function (r) { return r.json(); }).then(function (data) {
				entries = data.map(function (e) { e.tl = e.t.toLowerCase(); e.hl = e.h.toLowerCase(); e.xl = e.x.toLowerCase(); e.cl = (e.c || '').toLowerCase(); e.kl = (e.k || '').toLowerCase(); return e; });
				if (dlg.open) run();
			}).catch(function () { loading = null; });
		}
		return loading;
	}
	openBtn.addEventListener('pointerenter', load, { once: true });
	openBtn.addEventListener('focus', load, { once: true });

	function open() {
		if (dlg.open) { input.select(); return; }
		load();
		dlg.showModal();
		input.select();
		run();
	}
	function close() { if (dlg.open) dlg.close(); }
	openBtn.addEventListener('click', open);
	dlg.querySelector('.search-close').addEventListener('click', close);
	dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
	dlg.addEventListener('close', function () { input.setAttribute('aria-expanded', 'false'); openBtn.focus({ preventScroll: true }); });
	empty.addEventListener('click', function (e) {
		if (e.target.tagName !== 'BUTTON') return;
		input.value = e.target.textContent;
		input.focus();
		run();
	});

	document.addEventListener('keydown', function (e) {
		var t = e.target;
		var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
		if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dlg.open) close(); else open(); }
		else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
	});

	// A word starts at i in s (start of string, or after a non-letter).
	function wordStart(s, i) { return i === 0 || !/[a-z0-9]/.test(s.charAt(i - 1)); }
	// The term's letters appear in order, close together: "minon" finds "minion".
	function near(s, term) {
		if (term.length < 3) return false;
		var i = s.indexOf(term.charAt(0)), j, k, start;
		while (i !== -1) {
			start = i; k = 1; j = i + 1;
			while (k < term.length && j < s.length && j - start < term.length * 1.6 + 1) { if (s.charAt(j) === term.charAt(k)) k++; j++; }
			if (k === term.length) return true;
			i = s.indexOf(term.charAt(0), start + 1);
		}
		return false;
	}
	function score(e, terms, q) {
		var total = 0;
		for (var n = 0; n < terms.length; n++) {
			var term = terms[n], s = 0, i;
			if ((i = e.hl.indexOf(term)) !== -1) s += 14 + (wordStart(e.hl, i) ? 8 : 0);
			if ((i = e.tl.indexOf(term)) !== -1) s += 5 + (wordStart(e.tl, i) ? 3 : 0);
			if ((i = e.kl.indexOf(term)) !== -1) s += 4 + (wordStart(e.kl, i) ? 3 : 0);
			if ((i = e.xl.indexOf(term)) !== -1) {
				var count = 0, from = 0;
				while (count < 6 && (from = e.xl.indexOf(term, from)) !== -1) { count++; from += term.length; }
				s += 3 + count + (wordStart(e.xl, i) ? 2 : 0);
			}
			if (!s && e.cl.indexOf(term) !== -1) s = 2;
			if (!s) { if (near(e.hl, term)) s = 5; else if (near(e.tl, term)) s = 3; else if (term.length > 3 && near(e.xl, term)) s = 1; }
			if (!s) return 0;
			total += s;
		}
		if (terms.length > 1) { if (e.hl.indexOf(q) !== -1) total += 20; else if (e.xl.indexOf(q) !== -1) total += 10; }
		if (e.hl === q || e.tl === q) total += 12;
		return total;
	}

	function escapeHtml(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
	function highlight(s, re) {
		if (!re) return escapeHtml(s);
		return s.split(re).map(function (part, i) { return i % 2 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part); }).join('');
	}
	function snippet(e, terms) {
		var at = -1;
		for (var n = 0; n < terms.length && at === -1; n++) at = e.xl.indexOf(terms[n]);
		if (at === -1) {
			for (n = 0; n < terms.length && at === -1; n++) at = e.cl.indexOf(terms[n]);
			if (at === -1) return e.x.slice(0, 150);
			return (at > 40 ? '… ' : '') + e.c.slice(Math.max(0, at - 40), at + 130);
		}
		var start = Math.max(0, at - 50);
		if (start > 0) { var sp = e.x.indexOf(' ', start); if (sp !== -1 && sp < at) start = sp + 1; }
		return (start > 0 ? '… ' : '') + e.x.slice(start, start + 170);
	}

	function run() {
		var q = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
		var terms = q ? q.split(' ').filter(Boolean) : [];
		results = [];
		if (terms.length && entries) {
			entries.forEach(function (e) { var s = score(e, terms, q); if (s) results.push({ e: e, s: s }); });
			results.sort(function (a, b) { return b.s - a.s; });
			results = results.slice(0, 12);
		}
		var re = terms.length ? new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).sort(function (a, b) { return b.length - a.length; }).join('|') + ')', 'gi') : null;
		list.innerHTML = results.map(function (r, i) {
			var e = r.e;
			return '<li role="option" id="sr-' + i + '" aria-selected="false"><a href="' + escapeHtml(e.u) + '" tabindex="-1">' +
				'<span class="r-page">' + escapeHtml(e.t) + '</span>' +
				'<span class="r-head">' + highlight(e.h, re) + '</span>' +
				(e.x || e.c ? '<span class="r-text">' + highlight(snippet(e, terms), re) + '</span>' : '') + '</a></li>';
		}).join('');
		empty.hidden = false;
		if (!terms.length) empty.firstChild.textContent = 'Try ';
		else if (!entries) empty.firstChild.textContent = 'Loading the index… ';
		else if (!results.length) empty.firstChild.textContent = 'Nothing for “' + input.value.trim() + '”. Try ';
		else empty.hidden = true;
		input.setAttribute('aria-expanded', String(results.length > 0));
		select(results.length ? 0 : -1);
	}
	function select(i) {
		var items = list.children;
		if (sel >= 0 && items[sel]) items[sel].setAttribute('aria-selected', 'false');
		sel = i;
		if (sel >= 0 && items[sel]) {
			items[sel].setAttribute('aria-selected', 'true');
			input.setAttribute('aria-activedescendant', items[sel].id);
			items[sel].scrollIntoView({ block: 'nearest' });
		} else input.removeAttribute('aria-activedescendant');
	}
	function go(a) {
		close();
		var url = new URL(a.href, location.href);
		if (url.pathname === location.pathname && url.hash) {
			var target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
			history.pushState(null, '', url.hash);
			if (target) target.scrollIntoView({ block: 'start' });
		} else location.href = url.href;
	}

	input.addEventListener('input', run);
	input.addEventListener('keydown', function (e) {
		var n = results.length;
		if (e.key === 'ArrowDown') { e.preventDefault(); if (n) select((sel + 1) % n); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) select((sel - 1 + n) % n); }
		else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); if (n) select(0); }
		else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); if (n) select(n - 1); }
		else if (e.key === 'Enter') {
			var li = list.children[sel];
			if (li) { e.preventDefault(); go(li.querySelector('a')); }
		}
	});
	list.addEventListener('mousemove', function (e) {
		var li = e.target.closest('li');
		if (li) { var i = Array.prototype.indexOf.call(list.children, li); if (i !== sel) select(i); }
	});
	list.addEventListener('click', function (e) {
		var a = e.target.closest('a');
		if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
		e.preventDefault();
		go(a);
	});
})();

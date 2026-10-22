/* ============ Snapzy client interactions ============ */
(function () {
  'use strict';

  // --- AJAX like toggle ---
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.like-btn');
    if (!btn || btn.disabled) return;

    var postId = btn.getAttribute('data-post');
    var csrf = document.querySelector('input[name="_csrf"]');

    fetch('/posts/' + postId + '/like', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'x-csrf-token': csrf ? csrf.value : '',
      },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;
        btn.classList.toggle('liked', data.liked);
        btn.setAttribute('aria-pressed', data.liked ? 'true' : 'false');
        btn.querySelector('.heart').textContent = data.liked ? '♥' : '♡';
        btn.querySelector('.like-count').textContent = data.count;
        if (data.liked) {
          var h = btn.querySelector('.heart');
          h.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
            { duration: 280, easing: 'ease-out' }
          );
        }
      })
      .catch(function () { /* ignore */ });
  });

  // --- Image preview + drag-drop on upload page ---
  var input = document.getElementById('image-input');
  var dropzone = document.getElementById('dropzone');
  var preview = document.getElementById('preview');
  var inner = document.getElementById('dropzone-inner');

  if (input && preview) {
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      preview.src = URL.createObjectURL(file);
      preview.classList.remove('hidden');
      if (inner) inner.classList.add('hidden');
    });

    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropzone.classList.remove('dragover');
        });
      });
      dropzone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event('change'));
        }
      });
    }
  }

  // --- Auto-hide flash messages ---
  setTimeout(function () {
    document.querySelectorAll('.flash').forEach(function (el) {
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    });
  }, 3500);

  // --- Relative timestamps (raw server time stays as no-JS fallback) ---
  function relativeTime(iso) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return null;
    var secs = Math.round((Date.now() - then) / 1000);
    if (secs < 45) return 'just now';
    if (secs < 90) return '1m';
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + 'm';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + 'h';
    var days = Math.round(hours / 24);
    if (days < 7) return days + 'd';
    return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  document.querySelectorAll('time[datetime]').forEach(function (el) {
    var iso = el.getAttribute('datetime');
    var full = new Date(iso);
    if (isNaN(full)) return;
    el.setAttribute('title', full.toLocaleString());
    var rel = relativeTime(iso);
    if (rel) el.textContent = rel;
  });

  // --- Only blur post cards that are actually in view (backdrop-filter budget) ---
  var cards = document.querySelectorAll('.post-card');
  if (cards.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('is-inview', entry.isIntersecting);
      });
    }, { rootMargin: '120px 0px' });
    cards.forEach(function (c) { io.observe(c); });
  } else {
    cards.forEach(function (c) { c.classList.add('is-inview'); });
  }

  // ---------- Shared helpers ----------

  function getCsrf() {
    var el = document.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  var toastEl = null;
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2400);
  }

  // --- AJAX follow toggle (profiles + search results) ---
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.follow-btn');
    if (!btn || btn.disabled) return;
    var user = btn.getAttribute('data-user');
    if (!user) return;

    btn.disabled = true;
    fetch('/u/' + encodeURIComponent(user) + '/follow', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'x-csrf-token': getCsrf(),
      },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          setFollowState(btn, data.following);
          // Keep every button for this user in sync (e.g. profile + a list).
          document.querySelectorAll('.follow-btn[data-user="' + CSS.escape(user) + '"]')
            .forEach(function (b) { setFollowState(b, data.following); });
        }
      })
      .catch(function () { /* ignore */ })
      .then(function () { btn.disabled = false; });
  });

  function setFollowState(btn, following) {
    btn.classList.toggle('following', following);
    btn.setAttribute('aria-pressed', following ? 'true' : 'false');
    btn.textContent = following ? 'Following' : 'Follow';
    // Bump the follower count on the profile we just toggled from.
    if (following) {
      var c = document.querySelector('.follower-count');
      if (c && !btn.dataset.counted) {
        c.textContent = (parseInt(c.textContent, 10) || 0) + 1;
        btn.dataset.counted = '1';
      }
    } else {
      var c2 = document.querySelector('.follower-count');
      if (c2 && btn.dataset.counted) {
        c2.textContent = Math.max(0, (parseInt(c2.textContent, 10) || 1) - 1);
        delete btn.dataset.counted;
      }
    }
  }

  // --- Post share (Web Share API on mobile, clipboard fallback elsewhere) ---
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.share-btn');
    if (!btn) return;
    var url = new URL(btn.getAttribute('data-share-url'), window.location.origin).href;

    if (navigator.share) {
      navigator.share({ title: document.title, url: url }).catch(function () { /* dismissed */ });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { toast('Link copied to clipboard'); })
        .catch(function () { window.prompt('Copy this link:', url); });
    } else {
      window.prompt('Copy this link:', url);
    }
  });

  // --- Live search (debounced) ---
  var searchInput = document.getElementById('search-input');
  var resultsBox = document.getElementById('search-results');
  if (searchInput && resultsBox) {
    var debounce = null;
    var lastQ = window.__SEARCH_Q__ || '';

    searchInput.addEventListener('input', function () {
      clearTimeout(debounce);
      var q = searchInput.value.trim().slice(0, 50);
      if (q === lastQ) return;
      debounce = setTimeout(function () {
        lastQ = q;
        runSearch(q);
      }, 250);
    });

    function runSearch(q) {
      if (!q) {
        resultsBox.innerHTML =
          '<p class="muted search-hint">Start typing to find people on Snapzy.</p>';
        return;
      }
      fetch('/search.json?q=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (data) { renderResults(q, data.results || []); })
        .catch(function () {
          resultsBox.innerHTML = '<p class="muted search-hint">Something went wrong. Try again.</p>';
        });
    }

    function renderResults(q, results) {
      if (!results.length) {
        var p = document.createElement('p');
        p.className = 'muted search-hint';
        p.textContent = 'No people found for “' + q + '”.';
        resultsBox.replaceChildren(p);
        return;
      }
      var ul = document.createElement('ul');
      ul.className = 'user-list';
      results.forEach(function (r) { ul.appendChild(userRow(r)); });
      resultsBox.replaceChildren(ul);
    }

    function userRow(r) {
      var li = document.createElement('li');
      li.className = 'user-row glass';

      var a = document.createElement('a');
      a.className = 'user-row-main';
      a.href = '/u/' + encodeURIComponent(r.username);

      var av = document.createElement('span');
      av.className = 'avatar';
      av.setAttribute('aria-hidden', 'true');
      av.textContent = r.username.charAt(0).toUpperCase();

      var text = document.createElement('span');
      text.className = 'user-row-text';

      var name = document.createElement('span');
      name.className = 'user-row-name';
      name.textContent = r.username;

      var bio = document.createElement('span');
      bio.className = 'user-row-bio' + (r.bio ? '' : ' muted');
      bio.textContent = r.bio || 'No bio yet';

      text.appendChild(name);
      text.appendChild(bio);
      a.appendChild(av);
      a.appendChild(text);
      li.appendChild(a);

      var me = document.querySelector('.nav-user .name');
      if (me && me.textContent.trim() !== r.username) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm follow-btn' + (r.following ? ' following' : '');
        btn.setAttribute('data-user', r.username);
        btn.setAttribute('aria-pressed', r.following ? 'true' : 'false');
        btn.textContent = r.following ? 'Following' : 'Follow';
        li.appendChild(btn);
      }
      return li;
    }
  }
})();

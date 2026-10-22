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
})();

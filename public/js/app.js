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
})();

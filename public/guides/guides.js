// Reading progress bar and highlight of the current section in the contents list.
(function () {
  var bar = document.getElementById('bar');
  var links = [].slice.call(document.querySelectorAll('.toc a'));
  var heads = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  function tick() {
    var h = document.documentElement;
    if (bar) bar.style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100 + '%';
    var cur = 0;
    for (var i = 0; i < heads.length; i++) if (heads[i] && heads[i].getBoundingClientRect().top < 140) cur = i;
    links.forEach(function (a, i) { a.className = i === cur ? 'on' : ''; });
  }
  addEventListener('scroll', tick, { passive: true });
  tick();
})();

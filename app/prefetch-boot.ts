/**
 * Prefetch bootstrap.
 *
 * The episode grid is server rendered and React attaches its delegated
 * event listeners only once the page has hydrated. A pointer that lands on
 * a card before that point never reaches the React handler, so the very
 * first hover of a session is dropped and the browser has to start the
 * whole chain from scratch when the user clicks.
 *
 * This script is inlined into the document and runs while the HTML is
 * parsed, so it catches the first pointer movement no matter when it
 * happens. It owns the prefetch chain and exposes it on `window` so the
 * React hook can share the same work instead of repeating it.
 */
export const PREFETCH_BOOT = `
(function () {
  if (window.__onePacePrefetch) return;

  var done = Object.create(null);
  var inflight = Object.create(null);
  var timer = null;
  var pending = null;

  function firstUrls(text, limit) {
    var out = [];
    var lines = String(text).split(/\\r?\\n/);
    for (var i = 0; i < lines.length && out.length < limit; i++) {
      var trimmed = lines[i].trim();
      if (trimmed.indexOf("http://") === 0 || trimmed.indexOf("https://") === 0) {
        out.push(trimmed);
      }
    }
    return out;
  }

  async function touch(url) {
    try {
      var res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      return null;
    }
  }

  async function drain(url) {
    try {
      var res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) return false;
      await res.arrayBuffer();
      return true;
    } catch (err) {
      return false;
    }
  }

  function scheduleSegments(id, segments) {
    pending = { id: id, segments: segments };
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      var job = pending;
      pending = null;
      if (!job) return;
      for (var i = 0; i < job.segments.length; i++) {
        void drain(job.segments[i]);
      }
    }, 700);
  }

  async function chain(id) {
    if (done[id] || inflight[id]) return;
    inflight[id] = true;
    try {
      var body = await touch("/api/resolve?id=" + id);
      if (!body) return;
      var data;
      try {
        data = JSON.parse(body);
      } catch (err) {
        return;
      }
      var candidates = (data && data.candidates) || [];
      var masterPath = null;
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (c && c.type === "hls" && c.proxyUrl) {
          masterPath = c.proxyUrl;
          break;
        }
      }
      if (!masterPath) return;
      var master = await touch(masterPath);
      if (!master) return;
      var playlistUrl = firstUrls(master, 1)[0];
      if (!playlistUrl) return;
      var playlist = await touch(playlistUrl);
      if (!playlist) return;
      var segments = firstUrls(playlist, 1);
      if (!segments.length) return;
      done[id] = true;
      scheduleSegments(id, segments);
    } finally {
      delete inflight[id];
    }
  }

  function episodeIdOf(target) {
    if (!target || !target.closest) return null;
    var el = target.closest("[data-episode-id]");
    if (!el) return null;
    var id = Number(el.getAttribute("data-episode-id"));
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function onPointer(target) {
    var id = episodeIdOf(target);
    if (id === null) return;
    if (pending && pending.id !== id && timer) {
      clearTimeout(timer);
      timer = null;
      pending = null;
    }
    void chain(id);
  }

  document.addEventListener("pointerover", function (event) {
    onPointer(event.target);
  }, { passive: true });

  document.addEventListener("focusin", function (event) {
    onPointer(event.target);
  }, { passive: true });

  window.__onePacePrefetch = {
    prefetch: function (id) {
      void chain(id);
    },
    cancel: function () {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    }
  };
})();
`;

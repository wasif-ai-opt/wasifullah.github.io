// Wasif Ullah — Academic Website
// 1. footer year  2. nav blink on tab click  3. reveal-on-scroll
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 1. Footer year ----------
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // ---------- 2. Nav blink on tab click ----------
  // The clicked tab flashes briefly, then the page follows the link.
  if (!reduceMotion) {
    var navLinks = document.querySelectorAll(".site-nav a, .site-header-name");
    navLinks.forEach(function (link) {
      link.addEventListener("click", function (e) {
        // leave modified clicks (new tab etc.) and non-page links alone
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = link.getAttribute("href");
        if (!href || href.charAt(0) === "#") return;
        e.preventDefault();
        link.classList.add("nav-flash");
        window.setTimeout(function () {
          window.location.href = href;
        }, 300);
      });
    });
  }

  // ---------- 3. Reveal on scroll ----------
  // Elements appear only as they are scrolled into view.
  // The data-reveal attribute is added from JS, so without JS
  // (or with reduced motion) everything is simply visible.
  if (!reduceMotion && "IntersectionObserver" in window) {
    var selectors = [
      ".section-head",
      ".sim-panel",
      ".sim-caption",
      ".item",
      ".drow",
      ".figure",
      ".area-text > p",
      ".page-hero .lede",
      ".chips",
      ".interests li",
      ".section-lead",
      ".section-note"
    ];
    var els = [];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.setAttribute("data-reveal", "");
        els.push(el);
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // small stagger based on position among its siblings
        var sibs = el.parentElement
          ? Array.prototype.slice.call(el.parentElement.children).filter(function (c) {
              return c.hasAttribute("data-reveal");
            })
          : [el];
        var idx = Math.max(sibs.indexOf(el), 0);
        el.style.transitionDelay = Math.min(idx * 70, 350) + "ms";
        el.classList.add("is-visible");
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    els.forEach(function (el) { io.observe(el); });
  }
})();

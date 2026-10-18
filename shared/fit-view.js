// Pan, zoom and automatic fit for a drawing in an <svg>: the one behaviour all the graph and
// tree views share. Requires d3.
//
//   const view = createFitView({
//     svg: "tree-svg", root: "tree-root",   // ids of the <svg> and of the <g> that holds the drawing
//     scaleExtent: [0.08, 8],               // zoom limits (default)
//     maxScale: 1,                          // never enlarge the drawing beyond this when fitting
//     pad: 24, padX, padY,                  // empty margin kept around it, in pixels
//     align: "center" | "top",              // vertical placement of a drawing smaller than the view
//     sticky: true,                         // refit() leaves the view alone once the user has zoomed
//     bounds: () => ({ x, y, width, height }) | null,   // the drawing's extent; default: the root's bounding box
//     hasContent: () => true,               // refit() does nothing while this is false
//   });
//   view.refit();   // call after every (re)drawing and it fits the drawing into the view, without animation
//   view.fit();     // fit now, whatever the user did (double-click does this)
//
// Wheel: a mouse wheel zooms, a trackpad pinch zooms and a trackpad two-finger scroll pans.
// The view also refits when the svg's container changes size. Dragging does not stop the fitting; changing
// the zoom level with the wheel or a pinch does (sticky views), until fit() is called. hold()/release()
// let a tool set that state itself, for example after panning to a chosen spot.
// What the scroll wheel (and a two-finger trackpad scroll) does: "auto" tells a trackpad from a mouse wheel, "zoom"
// zooms on every wheel event, "pan" pans on every one. Pinch (ctrl + wheel) always zooms. Kept in localStorage and
// offered in the View menu, for the mice that "auto" mistakes for a trackpad.
var fitWheelMode = "auto";
try { fitWheelMode = localStorage.getItem("parser-tools-wheel") || "auto"; } catch (e) { /* storage blocked */ }
function setFitWheelMode(m) {
  fitWheelMode = m;
  try { localStorage.setItem("parser-tools-wheel", m); } catch (e) { /* storage blocked */ }
}
var fitViewUsed = false;

function createFitView(o) {
  fitViewUsed = true;
  const maxScale = o.maxScale === undefined ? 1 : o.maxScale;
  const padX = o.padX === undefined ? (o.pad === undefined ? 24 : o.pad) : o.padX;
  const padY = o.padY === undefined ? (o.pad === undefined ? 24 : o.pad) : o.padY;
  const sticky = o.sticky !== false;
  const svgEl = document.getElementById(o.svg);
  const svgSel = d3.select(svgEl);
  let held = false; // the user has set the zoom level
  let fitK = null; // the scale of the last fit

  // Wheel events come from a mouse wheel (zoom), a trackpad pinch (zoom: browsers send it as a wheel event with
  // ctrlKey set) or a trackpad two-finger scroll (pan). A mouse wheel gives whole steps of 100 or more pixels (or
  // lines/pages), a trackpad small and often fractional ones with deltaX; once an event looks like a trackpad, the
  // events of the same gesture (and its inertia) are taken as one.
  let lastTrackpad = 0;
  function isTrackpadPan(e) {
    if (e.__pan === undefined) {
      let pan = false;
      if (!e.ctrlKey && !e.shiftKey && fitWheelMode === "pan") pan = true;
      else if (!e.ctrlKey && !e.shiftKey && e.deltaMode === 0 && fitWheelMode === "auto") {
        const mouseLike = e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50 && (e.wheelDeltaY === undefined || e.wheelDeltaY % 120 === 0);
        pan = !mouseLike || e.timeStamp - lastTrackpad < 250;
        if (!mouseLike) lastTrackpad = e.timeStamp;
      }
      e.__pan = pan;
    }
    return e.__pan;
  }

  const zoom = d3.zoom()
    .scaleExtent(o.scaleExtent || [0.08, 8])
    .filter((e) => (e.type === "wheel" ? !isTrackpadPan(e) : !e.ctrlKey && !e.button))
    .wheelDelta((e) => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1))
    .on("zoom", (e) => {
      d3.select("#" + o.root).attr("transform", e.transform);
      if (e.sourceEvent && (fitK === null || Math.abs(e.transform.k - fitK) > 1e-6)) held = true;
    });
  svgSel.call(zoom).on("dblclick.zoom", null); // double-click fits instead of zooming in
  svgEl.addEventListener("wheel", (e) => {
    if (!isTrackpadPan(e)) return;
    e.preventDefault();
    const k = d3.zoomTransform(svgEl).k;
    svgSel.call(zoom.translateBy, -e.deltaX / k, -e.deltaY / k);
  }, { passive: false });

  function fit() {
    held = false;
    try {
      const rootEl = document.getElementById(o.root);
      const bb = (o.bounds && o.bounds()) || (rootEl && rootEl.getBBox());
      if (!bb || bb.width < 1 || bb.height < 1) return;
      const vw = svgEl.clientWidth || svgEl.parentElement.clientWidth || 400;
      const vh = svgEl.clientHeight || svgEl.parentElement.clientHeight || 300;
      const sc = Math.min(maxScale, Math.max(vw - 2 * padX, 20) / bb.width, Math.max(vh - 2 * padY, 20) / bb.height);
      const tx = (vw - bb.width * sc) / 2 - bb.x * sc;
      const ty = (o.align === "top" ? padY : (vh - bb.height * sc) / 2) - bb.y * sc;
      fitK = sc;
      svgSel.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(sc));
    } catch (e) {
      /* not laid out yet: the resize observer fits once it is */
    }
  }
  function refit() {
    if (o.hasContent && !o.hasContent()) return;
    if (sticky && held) return;
    fit();
  }

  svgEl.addEventListener("dblclick", fit);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(refit).observe(svgEl.parentElement);
  return { fit, refit, zoom, hold() { held = true; }, release() { held = false; } };
}

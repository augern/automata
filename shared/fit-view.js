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
// The view also refits when the svg's container changes size. Dragging does not stop the fitting; changing
// the zoom level with the wheel or a pinch does (sticky views), until fit() is called. hold()/release()
// let a tool set that state itself, for example after panning to a chosen spot.
function createFitView(o) {
  const maxScale = o.maxScale === undefined ? 1 : o.maxScale;
  const padX = o.padX === undefined ? (o.pad === undefined ? 24 : o.pad) : o.padX;
  const padY = o.padY === undefined ? (o.pad === undefined ? 24 : o.pad) : o.padY;
  const sticky = o.sticky !== false;
  const svgEl = document.getElementById(o.svg);
  const svgSel = d3.select(svgEl);
  let held = false; // the user has set the zoom level
  let fitK = null; // the scale of the last fit

  const zoom = d3.zoom()
    .scaleExtent(o.scaleExtent || [0.08, 8])
    .wheelDelta((e) => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002))
    .on("zoom", (e) => {
      d3.select("#" + o.root).attr("transform", e.transform);
      if (e.sourceEvent && (fitK === null || Math.abs(e.transform.k - fitK) > 1e-6)) held = true;
    });
  svgSel.call(zoom).on("dblclick.zoom", null); // double-click fits instead of zooming in

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

/**
 * The workspace frame, drawn before there is anything to put in it.
 *
 * This is the React twin of the `#bes-boot` block in `index.html`, and the two
 * exist for one continuous effect on a cold load:
 *
 *   1. the browser paints `#bes-boot` from the HTML, before any script runs
 *   2. React mounts, clears `#root`, and renders THIS in its place while the
 *      signed-in person is resolved
 *   3. the real shell replaces it, and only the content area changes
 *
 * If step 2 were a spinner on an empty page — which it was — the frame would
 * vanish and then the entire interface would arrive at once, which reads as a
 * fault. Keeping the same shape across all three steps means nothing ever
 * disappears; content simply fills a frame that was there from the first
 * frame.
 *
 * The measurements must match `#bes-boot`. `workspace-skeleton.test.ts` holds
 * the two files to the same numbers so they cannot drift apart unnoticed.
 */
export const WorkspaceSkeleton = () => (
  <div className="flex h-screen overflow-hidden bg-background" aria-hidden="true">
    <div className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block" />
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="h-14 shrink-0 border-b border-border bg-card" />
      <div className="flex-1 p-6">
        <div className="mb-6 h-7 w-56 rounded-xl bg-muted" />
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-64 rounded-xl border border-border bg-card" />
      </div>
    </div>
  </div>
);

import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { prefetchRoute } from "@/lib/nav/route-chunks";
import { prefetchRouteData } from "@/lib/nav/route-data";

/**
 * A router link that starts loading its screen — code AND data — when you
 * point at it.
 *
 * A pointer reaches a menu item some way before the click lands, and a
 * keyboard user focuses it before pressing Enter. That gap is usually longer
 * than the chunk takes to arrive, so by the time the navigation happens there
 * is nothing left to wait for and the screen swaps in one frame.
 *
 * The chunk was only ever half of it. A screen whose code is ready still
 * mounts, starts its queries and shows an empty layout for a few hundred
 * milliseconds — measured at 403ms on CreditOps and 1352ms on People. So the
 * hover warms the screen's first queries too, and by the time it mounts the
 * cache already holds what it renders (Dee, 2026-09-23: "i want real time load
 * experience with no feeling of latency at all").
 *
 * Nothing here changes what is rendered, so a failed prefetch costs nothing —
 * the navigation itself will load the chunk, run the query, and report any
 * error the normal way.
 */
export const PrefetchLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, onPointerEnter, onFocus, ...rest }, ref) => {
    const qc = useQueryClient();
    const { user } = useAuth();
    const warm = () => {
      if (typeof to !== "string") return;
      prefetchRoute(to);
      prefetchRouteData(qc, to, user?.id ?? "");
    };
    return (
      <Link
        {...rest}
        ref={ref}
        to={to}
        onPointerEnter={(event) => {
          warm();
          onPointerEnter?.(event);
        }}
        onFocus={(event) => {
          warm();
          onFocus?.(event);
        }}
      />
    );
  },
);
PrefetchLink.displayName = "PrefetchLink";

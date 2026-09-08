import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { prefetchRoute } from "@/lib/nav/route-chunks";

/**
 * A router link that starts downloading its screen when you point at it.
 *
 * A pointer reaches a menu item some way before the click lands, and a
 * keyboard user focuses it before pressing Enter. That gap is usually longer
 * than the chunk takes to arrive, so by the time the navigation happens there
 * is nothing left to wait for and the screen swaps in one frame.
 *
 * Nothing here changes what is rendered, so a failed prefetch costs nothing —
 * the navigation itself will load the chunk and report any error the normal
 * way.
 */
export const PrefetchLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, onPointerEnter, onFocus, ...rest }, ref) => {
    const warm = () => {
      if (typeof to === "string") prefetchRoute(to);
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

/** The empty space that stands in for the rows a virtualized list is not rendering. */
export function VirtualSpacer({ height, as = "div", colSpan }: { height: number; as?: "tr" | "li" | "div"; colSpan?: number }) {
  if (height <= 0) return null;
  if (as === "tr") return <tr aria-hidden style={{ height }}><td colSpan={colSpan} /></tr>;
  if (as === "li") return <li aria-hidden style={{ height }} />;
  return <div aria-hidden style={{ height }} />;
}

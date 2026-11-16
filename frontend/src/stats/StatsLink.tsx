import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { navigate } from "./routes";

export type StatsLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
};

/**
 * The stats' one in-page link: an `<a href>`, so it can be opened in a new tab, copied or
 * bookmarked, whose plain click moves the page in place (`navigate`) instead of reloading it.
 * A click with another button or a modifier key, or on a link with a `target`, is the browser's.
 * Every other prop (`className`, `aria-*`, …) goes to the `<a>`.
 */
export const StatsLink = forwardRef<HTMLAnchorElement, StatsLinkProps>(function StatsLink(
  { href, onClick, children, ...rest },
  ref
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (rest.target) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a ref={ref} href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});

export default StatsLink;

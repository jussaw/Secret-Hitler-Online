/** A link to another site, opened in a new tab: the login page's and the lobby's footer links. */
export default function OutLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

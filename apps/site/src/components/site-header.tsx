import { BRAND } from "../brand";
import { START_URL } from "../links";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#your-people", label: "Your people" },
  { href: "#film", label: "Watch the film" },
  { href: "#trust", label: "Your data" },
  { href: "#get-app", label: "Get the app" },
];

// Open Daksha is also the way to sign in: the app has its own sign-in page.
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <a className="brand" href="#top">
          <img src="/debo.svg" alt="" width={36} height={36} />
          {BRAND}
        </a>
        <nav className="site-nav" aria-label="Main">
          <ul className="site-nav__links" role="list">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
          <ThemeToggle />
          <a className="btn btn--primary btn--small" href={START_URL}>
            Open {BRAND}
          </a>
        </nav>
      </div>
    </header>
  );
}

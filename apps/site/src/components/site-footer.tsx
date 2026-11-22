import { BRAND } from "../brand";
import { PRIVACY_URL, RELEASES_URL, START_URL } from "../links";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <p className="small">
          A kind, honest home for your memories. {BRAND} is an early version.
        </p>
        <nav aria-label="Footer">
          <ul role="list">
            <li>
              <a href={START_URL}>Open {BRAND}</a>
            </li>
            <li>
              <a href="#get-app">Get the app</a>
            </li>
            <li>
              <a href={RELEASES_URL}>All app versions</a>
            </li>
            <li>
              <a href={PRIVACY_URL}>Privacy</a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

import { BRAND } from "../brand";
import { ANDROID_APK_URL, RELEASES_URL, START_URL } from "../links";
import { ArrowIcon, DownloadIcon } from "./icons";
import { Badge, Section, SectionHead, stagger } from "./section";

export function GetApp() {
  return (
    <Section id="get-app" tone="band">
      <SectionHead
        id="get-app"
        align="center"
        title="Get the app"
        lead={`${BRAND} works in any web browser, on a computer or a phone. There is also an early app for Android phones.`}
      />
      <div className="platforms">
        <article className="platform" data-reveal="" style={stagger(0)}>
          <div>
            <Badge tone="warn">Early test build</Badge>
          </div>
          <h3 className="h3">Android</h3>
          <p className="body-lg">
            Download the app file and open it on your phone. Android will ask you to allow installs from your browser.
            It is not on Google Play yet, and nobody has tried it on a real phone yet, so expect rough edges.
          </p>
          <div className="btn-row">
            <a className="btn btn--primary" href={ANDROID_APK_URL}>
              <DownloadIcon />
              Download for Android
            </a>
            <a className="btn btn--secondary" href={RELEASES_URL}>
              All versions
            </a>
          </div>
        </article>
        <article className="platform" data-reveal="" style={stagger(1)}>
          <div>
            <Badge>Not available yet</Badge>
          </div>
          <h3 className="h3">iPhone</h3>
          <p className="body-lg">
            The iPhone app is not available yet. {BRAND} works in your phone&rsquo;s browser at my.debo.life. In Safari,
            tap Share, then Add to Home Screen, and it sits on your home screen like an app.
          </p>
          <div className="btn-row">
            <a className="btn btn--secondary" href={START_URL}>
              Open {BRAND} in the browser
              <ArrowIcon />
            </a>
          </div>
        </article>
      </div>
    </Section>
  );
}

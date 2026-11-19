import type { CSSProperties, ReactNode } from "react";

type SectionProps = {
  /** The section's id, used by links like #ask. The heading inside gets id={`${id}-title`}. */
  id: string;
  /** "band" paints the section in the slightly darker band colour. */
  tone?: "plain" | "band";
  children: ReactNode;
};

// One full-width section of the page, named by its own heading for screen
// readers, with the content held in the page's centre column.
export function Section({ id, tone = "plain", children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={tone === "band" ? "section section--band" : "section"}
    >
      <div className="wrap">{children}</div>
    </section>
  );
}

type SectionHeadProps = {
  /** The section's id: the heading gets id={`${id}-title`}. */
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  /** A status badge, like "New, early version", shown above the heading. */
  badge?: ReactNode;
  align?: "start" | "center";
};

// The same heading block for every section: a big heading, then one or two
// plain sentences. The heading wipes up into view; the lead follows.
export function SectionHead({ id, title, lead, badge, align = "start" }: SectionHeadProps) {
  return (
    <div className={align === "center" ? "section-head section-head--center" : "section-head"}>
      {badge ? <div>{badge}</div> : null}
      <h2 className="h2" id={`${id}-title`} data-reveal="clip">
        {title}
      </h2>
      {lead ? (
        <p className="lead" data-reveal="" style={stagger(1)}>
          {lead}
        </p>
      ) : null}
    </div>
  );
}

type BadgeProps = { tone?: "live" | "new" | "warn" | "plain"; children: ReactNode };

export function Badge({ tone = "plain", children }: BadgeProps) {
  return <span className={tone === "plain" ? "badge" : `badge badge--${tone}`}>{children}</span>;
}

/** Delay index for staggered reveals, as a style object. */
export function stagger(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

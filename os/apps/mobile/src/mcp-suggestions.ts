// Suggested tool servers (MCP) for "Add your own tool server". Built by hand from the
// manifests copied from Hermes Agent (third_party/hermes-mcps/optional-mcps/*/manifest.yaml,
// MIT, commit aeb5a07): the service's name, its address, and whether it needs a sign-in on the
// service's own page. os/tests/mcp-suggestions.test.ts checks each one against its manifest.
// These are other companies' servers: a suggestion only fills in the form, and adding one still
// shows the warning. See third_party/hermes-mcps/SOURCE.md for what was left out and why.

export interface ToolServerSuggestion {
  /** The manifest folder name in third_party/hermes-mcps/optional-mcps. */
  id: string;
  name: string;
  url: string;
  /** "sign-in": the service's own sign-in page (OAuth). "none": no secret needed. */
  auth: "sign-in" | "none";
  /** What it does, from the manifest. */
  about: string;
  /** Useful to most people, not only developers: shown first. */
  everyday?: boolean;
}

export const TOOL_SERVER_SUGGESTIONS: readonly ToolServerSuggestion[] = [
  { id: "airtable", name: "Airtable", url: "https://mcp.airtable.com/mcp", auth: "sign-in", about: "Bases, tables, and records from your Airtable workspace." },
  { id: "algolia", name: "Algolia", url: "https://mcp.algolia.com/mcp", auth: "sign-in", about: "Algolia search: indices, analytics, and settings (read-only)." },
  { id: "alltrails", name: "AllTrails", url: "https://www.alltrails.com/mcp", auth: "none", about: "AllTrails: find hikes and trails with reviews and ratings.", everyday: true },
  { id: "amplitude", name: "Amplitude", url: "https://mcp.amplitude.com/mcp", auth: "sign-in", about: "Amplitude analytics: charts, dashboards, experiments, flags." },
  { id: "atlassian", name: "Atlassian (Jira and Confluence)", url: "https://mcp.atlassian.com/v1/mcp/authv2", auth: "sign-in", about: "Jira issues and Confluence pages via Atlassian's hosted remote MCP." },
  { id: "attio", name: "Attio", url: "https://mcp.attio.com/mcp", auth: "sign-in", about: "CRM records, lists, and notes in Attio." },
  { id: "aws-knowledge", name: "AWS docs", url: "https://knowledge-mcp.global.api.aws", auth: "none", about: "Authoritative AWS docs, API references, and best practices." },
  { id: "betterstack", name: "Better Stack", url: "https://mcp.betterstack.com", auth: "sign-in", about: "Better Stack: logs, uptime monitors, incidents, and status pages." },
  { id: "buildkite", name: "Buildkite", url: "https://mcp.buildkite.com/mcp", auth: "sign-in", about: "CI/CD pipelines, builds, and test results from Buildkite." },
  { id: "calendly", name: "Calendly", url: "https://mcp.calendly.com", auth: "sign-in", about: "Scheduling links, events, and invitees from Calendly.", everyday: true },
  { id: "canva", name: "Canva", url: "https://mcp.canva.com/mcp", auth: "sign-in", about: "Create, search, and manage Canva designs.", everyday: true },
  { id: "circleci", name: "CircleCI", url: "https://mcp.circleci.com/v1/mcp", auth: "sign-in", about: "CircleCI: diagnose build failures, read logs, rerun workflows." },
  { id: "clickup", name: "ClickUp", url: "https://mcp.clickup.com/mcp", auth: "sign-in", about: "Tasks, docs, and workspaces in ClickUp." },
  { id: "close", name: "Close", url: "https://mcp.close.com/mcp", auth: "sign-in", about: "Sales CRM: leads, opportunities, calls, and emails." },
  { id: "cloudflare", name: "Cloudflare", url: "https://mcp.cloudflare.com/mcp?codemode=false", auth: "sign-in", about: "Full Cloudflare API access via the official remote MCP." },
  { id: "cloudinary", name: "Cloudinary", url: "https://asset-management.mcp.cloudinary.com/mcp", auth: "sign-in", about: "Upload, search, and transform media assets in Cloudinary." },
  { id: "comfy-cloud", name: "Comfy Cloud", url: "https://cloud.comfy.org/mcp", auth: "sign-in", about: "Generate images, video, audio, and 3D on Comfy Cloud." },
  { id: "context7", name: "Context7", url: "https://mcp.context7.com/mcp", auth: "none", about: "Up-to-date, version-specific library docs and code examples." },
  { id: "craft", name: "Craft", url: "https://mcp.craft.do/my/mcp", auth: "sign-in", about: "Craft: structured docs, tasks, and personal knowledge base.", everyday: true },
  { id: "datadog", name: "Datadog", url: "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp", auth: "sign-in", about: "Logs, monitors, dashboards, and incidents from Datadog." },
  { id: "deepwiki", name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", auth: "none", about: "Ask questions about any public GitHub repo (Devin's DeepWiki)." },
  { id: "dropbox", name: "Dropbox", url: "https://mcp.dropbox.com/mcp", auth: "sign-in", about: "Search, read, and manage files in Dropbox.", everyday: true },
  { id: "figma", name: "Figma", url: "https://mcp.figma.com/mcp", auth: "sign-in", about: "Official Figma remote MCP — design context, Code Connect, and write-to-canvas via https://mcp.figma.com/mcp (OAuth)." },
  { id: "fireflies", name: "Fireflies", url: "https://api.fireflies.ai/mcp", auth: "sign-in", about: "Meeting transcripts, summaries, and action items." },
  { id: "gamma", name: "Gamma", url: "https://mcp.gamma.app/mcp", auth: "sign-in", about: "Gamma: generate and edit AI presentations, docs, and sites." },
  { id: "gitlab", name: "GitLab", url: "https://gitlab.com/api/v4/mcp", auth: "sign-in", about: "GitLab: issues, merge requests, pipelines, and repo context." },
  { id: "globalping", name: "Globalping", url: "https://mcp.globalping.dev/mcp", auth: "sign-in", about: "Ping, traceroute, DNS, and HTTP tests from global probes." },
  { id: "grafana", name: "Grafana", url: "https://mcp.grafana.com/mcp", auth: "sign-in", about: "Query metrics, logs, dashboards, alerts, and incidents from Grafana Cloud." },
  { id: "hugging_face", name: "Hugging Face", url: "https://huggingface.co/mcp", auth: "sign-in", about: "Models, datasets, Spaces, and papers from the Hugging Face Hub." },
  { id: "indeed", name: "Indeed", url: "https://mcp.indeed.com/claude/mcp", auth: "sign-in", about: "Search jobs and listings on Indeed." },
  { id: "intercom", name: "Intercom", url: "https://mcp.intercom.com/mcp", auth: "sign-in", about: "Conversations, tickets, and customer data from Intercom." },
  { id: "kiwi", name: "Kiwi.com", url: "https://mcp.kiwi.com", auth: "none", about: "Kiwi.com flight search: itineraries with direct booking links.", everyday: true },
  { id: "klaviyo", name: "Klaviyo", url: "https://mcp.klaviyo.com/mcp?core-tools-only=true&disable-tools-with-user-generated-content=true", auth: "sign-in", about: "Klaviyo marketing: campaigns, flows, segments, and reporting." },
  { id: "linear", name: "Linear", url: "https://mcp.linear.app/mcp", auth: "sign-in", about: "Find, create, and update Linear issues, projects, and comments." },
  { id: "microsoft-learn", name: "Microsoft Learn", url: "https://learn.microsoft.com/api/mcp", auth: "none", about: "Official Microsoft, Azure, and .NET docs and code samples." },
  { id: "miro", name: "Miro", url: "https://mcp.miro.com/", auth: "sign-in", about: "Read and edit Miro boards, diagrams, and frames.", everyday: true },
  { id: "mixpanel", name: "Mixpanel", url: "https://mcp.mixpanel.com/mcp", auth: "sign-in", about: "Mixpanel analytics: events, funnels, retention, dashboards." },
  { id: "monday", name: "monday.com", url: "https://mcp.monday.com/mcp", auth: "sign-in", about: "Boards, items, docs, and workflows in monday.com." },
  { id: "motherduck", name: "MotherDuck", url: "https://api.motherduck.com/mcp", auth: "sign-in", about: "MotherDuck: query DuckDB cloud warehouses with SQL." },
  { id: "neon", name: "Neon", url: "https://mcp.neon.tech/mcp", auth: "sign-in", about: "Neon serverless Postgres: projects, branches, and SQL." },
  { id: "netlify", name: "Netlify", url: "https://netlify-mcp.netlify.app/mcp", auth: "sign-in", about: "Sites, deploys, and env vars via Netlify's hosted MCP." },
  { id: "notion", name: "Notion", url: "https://mcp.notion.com/mcp", auth: "sign-in", about: "Pages and databases from your Notion workspace.", everyday: true },
  { id: "plaid", name: "Plaid", url: "https://api.dashboard.plaid.com/mcp/", auth: "sign-in", about: "Plaid dashboard: integrations, Items, and usage debugging." },
  { id: "postman", name: "Postman", url: "https://mcp.postman.com/minimal", auth: "sign-in", about: "Postman workspaces, collections, environments, and APIs." },
  { id: "prisma-postgres", name: "Prisma Postgres", url: "https://mcp.prisma.io/mcp", auth: "sign-in", about: "Create and manage Prisma Postgres databases." },
  { id: "railway", name: "Railway", url: "https://mcp.railway.com", auth: "sign-in", about: "Railway: projects, services, deployments, and environments." },
  { id: "semgrep", name: "Semgrep", url: "https://mcp.semgrep.ai/mcp", auth: "sign-in", about: "Scan code for security vulnerabilities with Semgrep." },
  { id: "sentry", name: "Sentry", url: "https://mcp.sentry.dev/mcp", auth: "sign-in", about: "Issues, stack traces, and error context from Sentry." },
  { id: "strava", name: "Strava", url: "https://mcp.strava.com/mcp", auth: "sign-in", about: "Strava: activities, fitness trends, training load (read-only).", everyday: true },
  { id: "stripe", name: "Stripe", url: "https://mcp.stripe.com", auth: "sign-in", about: "Payments, customers, and invoices via Stripe's hosted MCP." },
  { id: "supabase", name: "Supabase", url: "https://mcp.supabase.com/mcp", auth: "sign-in", about: "Database, auth, and storage from your Supabase projects." },
  { id: "todoist", name: "Todoist", url: "https://ai.todoist.net/mcp", auth: "sign-in", about: "Manage Todoist tasks and projects.", everyday: true },
  { id: "trivago", name: "trivago", url: "https://mcp.trivago.com/mcp", auth: "none", about: "trivago hotel search: compare prices by city and dates.", everyday: true },
  { id: "twelve-data", name: "Twelve Data", url: "https://mcp.twelvedata.com/mcp", auth: "sign-in", about: "Stocks, forex, and crypto market data from Twelve Data." },
  { id: "twilio-docs", name: "Twilio docs", url: "https://mcp.twilio.com/docs", auth: "none", about: "Twilio developer docs search (public beta, read-only)." },
  { id: "vercel", name: "Vercel", url: "https://mcp.vercel.com", auth: "sign-in", about: "Deployments, logs, and projects via Vercel's hosted MCP." },
  { id: "webflow", name: "Webflow", url: "https://mcp.webflow.com/mcp", auth: "sign-in", about: "Sites, CMS collections, and pages via Webflow's hosted MCP." },
  { id: "wolfram", name: "Wolfram|Alpha", url: "https://agenttools.wolfram.com/mcp", auth: "none", about: "Wolfram|Alpha computation, math, and curated knowledge.", everyday: true },
  { id: "wordpress-com", name: "WordPress.com", url: "https://public-api.wordpress.com/wpcom/v2/mcp/v1", auth: "sign-in", about: "WordPress.com: posts, pages, drafts, stats, and comments." },
];

/** Up to `limit` suggestions matching the words typed, everyday ones first. */
export function suggestToolServers(query: string, limit = 8): ToolServerSuggestion[] {
  const words = query.trim().toLowerCase();
  const matches = TOOL_SERVER_SUGGESTIONS.filter(
    (s) => !words || `${s.name} ${s.id} ${s.about}`.toLowerCase().includes(words),
  );
  return [...matches]
    .sort((a, b) => Number(!!b.everyday) - Number(!!a.everyday) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

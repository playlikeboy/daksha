# Sign in with ChatGPT and ChatGPT plan usage

**Status:** Proposed. Not implemented.  
**Owner:** Daksha  
**Related:** [BYOK and plans](./BYOK-AND-PLANS.md), [architecture](./ARCHITECTURE.md), [privacy and trust](./PRIVACY-AND-TRUST.md), [new app authentication](../os/docs/AUTH.md)

## 1. Goal

Give a Daksha user an optional way to use eligible OpenAI models through the user's existing ChatGPT plan, without asking the user to create an OpenAI API key and without making Daksha pay per-request API charges for those authorized requests.

The OpenAI feature is **Sign in with ChatGPT (SIWC)**. It has two separate capabilities:

1. **Identity sign-in:** use a ChatGPT account to identify a person.
2. **ChatGPT plan usage:** with separate consent, use eligible Responses API capabilities against the person's eligible ChatGPT allowance or credits.

These permissions are independent. A successful identity sign-in does not mean the user has approved plan usage.

This is an optional model-provider connection. It does not replace Daksha's existing Neon Auth account, and it does not replace the existing Anthropic, Neon AI Gateway, or user-owned-key paths.

## 2. Important product and eligibility constraints

### 2.1 This is not a free, unlimited OpenAI API

- Requests consume the authenticated user's eligible ChatGPT plan allowance or applicable credits.
- Usage is subject to the user's plan eligibility, workspace/admin policy, OpenAI limits, and any per-app limit the user sets in ChatGPT settings.
- Usage in another app can affect the same shared allowance. Daksha must not promise a separate or unlimited quota.
- This is a supported Responses API integration, not access to every feature in the ChatGPT product, private ChatGPT conversations, memories, or the user's API key.
- OpenAI's current open-source guide describes eligible ChatGPT Plus and Pro users. The Help Center describes Go, Plus, Pro, and Business for participating commercial apps. Do not hard-code plan names as the eligibility check; rely on the granted permission and the actual response from OpenAI.

### 2.2 The hosted Daksha service is not automatically eligible

OpenAI's current SIWC terms require ChatGPT-plan requests to originate from the user's local runtime, or from a remote runtime that the user controls. Persisted authentication tokens must remain local and under the user's control.

Daksha's centrally managed Cloudflare deployment is controlled by Daksha, not by each user. Therefore:

- **Do not store SIWC access, refresh, or ID tokens in Daksha's Neon database, Cloudflare Worker secrets, Cloudflare storage, or any other Daksha-managed server.**
- **Do not proxy plan-usage inference through Daksha's centrally managed API or workers.**
- Do not enable this path on `my.daksha.life` / the hosted Daksha service unless OpenAI has explicitly approved the commercial/hosted integration and confirmed the permitted token and runtime architecture in writing.
- OpenAI currently describes website/commercial SIWC access as a limited partner trial. Submit the [SIWC partner interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) before planning a hosted-SaaS launch.

The open-source plan-usage path is documented for open-source and locally hosted apps. A public GitHub repository alone is not proof that every deployment shape is eligible.

### 2.3 Initial target

Start with a **local or user-controlled self-hosted Daksha runtime**, subject to a technical spike confirming the supported client/callback flow and secure credential storage.

The existing Expo web/mobile app must not be assumed compatible merely because it can open a browser. OpenAI's current open-source registration guide documents a loopback callback on `127.0.0.1`; validate the correct flow for each target platform before shipping it. If the current app cannot meet the runtime and credential requirements, build a separate local companion/host rather than moving credentials to Daksha's managed servers.

## 3. Intended user experience

In Settings → AI provider, show a separate option:

**Use my ChatGPT plan**

Before connecting, explain in plain language:

- Daksha will use the user's ChatGPT allowance for eligible AI requests.
- The user must approve the ChatGPT plan permission separately from identity sign-in.
- The user's plan limits still apply and usage may be shared with other connected apps.
- Only the context required for the current Daksha task is sent to OpenAI.
- Connecting does not give Daksha access to ChatGPT conversations or memories.
- The user can review usage and disconnect the app in ChatGPT settings.

After connection, show:

- Connected ChatGPT account label (from the validated identity; avoid exposing more account information than needed).
- Whether plan-usage permission was granted.
- Selected model, populated from the current account's available model list.
- A link to ChatGPT Settings → Usage.
- A clear Disconnect action.

Use OpenAI's approved SIWC branding and the exact button label **Continue with ChatGPT** where applicable. Do not make this look like a Daksha-owned subscription or imply that ChatGPT plan usage is included in a Daksha paid plan.

If the user declines plan usage, keep the rest of Daksha available and offer the existing provider choices. Do not repeatedly force OAuth consent.

## 4. Proposed architecture

### 4.1 Provider boundary

Keep all Daksha model selection and provider routing behind `@debo/llm`, in line with [BYOK-AND-PLANS.md](./BYOK-AND-PLANS.md).

Add an optional provider adapter for ChatGPT plan usage only in a runtime that meets OpenAI's local/user-controlled requirements.

The adapter must not:

- Turn the OAuth grant into a general-purpose API proxy.
- Accept requests triggered by another Daksha user's activity.
- Pool or share a connected user's allowance with another account.
- Use one user's ChatGPT plan to answer another user's request.
- Silently switch to Daksha-paid inference when the ChatGPT request fails.

Existing provider paths remain available:

1. User's own supported API key.
2. Daksha's configured provider/gateway, where enabled.
3. ChatGPT plan usage, only in an eligible local or user-controlled runtime.

### 4.2 Request path for a local/user-controlled runtime

For an eligible runtime, the intended flow is:

1. The signed-in Daksha client asks the Daksha API for the user's relevant journal/memory context using the existing Daksha session.
2. The API enforces the existing per-user data boundary and returns only the minimal context and source references needed for the current question.
3. The local/user-controlled runtime composes the request and calls OpenAI's public Responses API directly with the user's SIWC access token.
4. The local runtime streams the answer to the app and displays Daksha source references.
5. Daksha's managed server does not receive or store the ChatGPT access or refresh token and does not relay the inference request.

This separation is important: retrieval from Daksha's data service does not authorize moving the user's ChatGPT credentials or the inference call into Daksha's centrally managed runtime.

If the current mobile/web runtime cannot perform this flow while meeting OpenAI's requirements, stop and redesign the host boundary before implementation.

## 5. OAuth and account registration

Follow the current [OpenAI open-source registration and sign-in guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) exactly. Do not invent OAuth endpoints, scopes, or callback behavior.

For the documented open-source dynamic-registration flow:

- Use Authorization Code with PKCE and OpenID Connect.
- For first-time registration, use `client_id=dynamic_agent_client`, the actual app name in `agent_name_hint`, and a stable `ext_agent_host_id`.
- Use the returned, issued `client_id` for later sign-ins. Do not save or reuse `dynamic_agent_client` as the account's issued client ID.
- Reuse the same host ID for the same host. Use a distinct opaque host ID for each separate host. Do not use a user's email or Daksha user ID as the host ID.
- Use a loopback callback on `127.0.0.1` with the exact URI preserved between authorization and token exchange. The current guide says not to substitute `localhost`.
- Generate fresh, cryptographically random `state`, OIDC `nonce`, and PKCE verifier/challenge for every authorization attempt.
- Request identity scopes `openid profile email` and, only when the user asks to enable plan usage, the plan-usage scopes `offline_access resource.invoke chatgpt.tokens.use.direct`.
- Set the resource to `https://api.openai.com/v1`.
- Validate the callback state, ID token, issuer, audience/client binding, nonce, expiry, and granted scopes according to OpenAI's current guide.
- Treat the ChatGPT plan permission as enabled only when the returned grant includes `chatgpt.tokens.use.direct`. If identity is valid but that scope is absent, keep identity separate and do not make plan-usage requests.

The documented open-source dynamic-registration flow does not require a partner API key or client secret. This must not be confused with the separate commercial website/partner integration.

## 6. Credential storage and lifecycle

Credentials must remain in protected storage controlled by the person running the local/self-hosted runtime.

- Prefer the operating system's secure credential store where available.
- For a local file-based runtime, follow OpenAI's file-storage guidance: restrict file permissions (for example, `0600` on Unix), write atomically, and keep the file outside the repository.
- Never put tokens in browser localStorage/sessionStorage, URLs, source control, analytics, support transcripts, or logs.
- Never send a refresh token to the Daksha API.
- Keep each ChatGPT account registration separate, including its issued client ID, validated identity, granted scopes, and tokens.
- Access tokens currently have a one-hour lifetime; refresh tokens currently have a 30-day lifetime and rotate on refresh. Treat these as current documented values, not constants that can never change.
- Serialize refreshes for each account so two processes cannot race a rotating refresh token. Replace the access token, expiry, scopes, and refresh token together after successful refresh.
- On disconnect, stop new requests, revoke the renewable session using the current OpenID discovery revocation endpoint, then clear local credentials. If remote revocation cannot be confirmed, tell the user they can disconnect Daksha in ChatGPT settings.
- OpenAI does not currently provide a disconnect webhook for this flow. Handle revoked/invalid credentials when a request or refresh confirms the disconnection.

See [accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) and the [token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference).

## 7. Model discovery and inference

Use only the documented public Responses API path for this integration.

### 7.1 Model discovery

- Fetch the model catalog with the selected account's access token from `GET https://api.openai.com/v1/models`.
- Show only entries whose `visibility` is `list`.
- Display `display_name` and send the corresponding `slug` as the model value.
- Refresh the catalog when the user changes ChatGPT account.
- Do not hard-code a model list or assume every ChatGPT model is available through this path.

### 7.2 Responses API

- Send eligible requests to `POST https://api.openai.com/v1/responses` with the selected account's bearer access token.
- Set `store: false` and `stream: true` on every HTTP inference request.
- Send the full required conversation/context in the `input` array. Do not rely on server-side conversation persistence or `previous_response_id` for this HTTP flow.
- Use `instructions` or supported developer messages for Daksha's behavior. Do not send a system-role message in the form rejected by the current preview.
- Follow the current preview limitations for supported fields, tools, models, and capabilities. Do not assume that every feature supported by the standard API is supported through ChatGPT plan usage.
- Do not call ChatGPT's private `backend-api` endpoints.

For Daksha's first version, limit the integration to a narrow, user-initiated text question/answer flow. Treat tool use, background jobs, voice, image generation, embeddings, and long-running agent actions as out of scope until the current SIWC compatibility documentation explicitly supports them and the runtime remains user-controlled.

References: [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) and [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## 8. Privacy and safety

Daksha contains highly personal journals, memories, and potentially sensitive records. Before sending context to OpenAI:

- Tell the person that the specific context selected for the current answer will be sent to OpenAI.
- Send the smallest useful set of relevant excerpts, not the person's entire journal or memory store.
- Keep Daksha source IDs/links so the answer can cite the original entries.
- Keep untrusted journal, document, connector, and web text clearly separated from Daksha instructions. Treat that text as data, never as instructions.
- Do not include another person's data or another Daksha user's data in the request.
- Do not log prompts, retrieved excerpts, completions, tokens, or full provider error bodies. Log only safe metadata such as request IDs, timestamps, model slug, duration, and status.
- Do not claim that SIWC gives Daksha access to the user's ChatGPT history or memory.
- Update the privacy policy and provider list before enabling the feature for real users. Explain that user-selected Daksha context is sent to OpenAI when this provider is active.
- Keep data export and account deletion behavior clear. Removing a ChatGPT connection must not delete Daksha journal data; deleting a Daksha account must also remove Daksha-held connection metadata, if any.

A person must explicitly initiate each request. Any future background use would need separate express consent and must still meet OpenAI's user-control requirements.

## 9. Failure handling and billing fallback

Follow OpenAI's current [errors and recovery guide](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).

| Situation | Daksha behavior |
|---|---|
| User signs in but does not grant plan usage | Keep sign-in state separate; do not call Responses API with this connection. Offer existing provider choices. |
| User is not eligible / policy denies use | Explain that ChatGPT plan usage is unavailable for this account or workspace. Do not loop OAuth. |
| Access token expires | Refresh using the saved issued client ID and rotating refresh token. |
| Refresh token is invalid/revoked | Stop requests, clear unusable credentials, and ask the user to reconnect. |
| Usage limit is reached (`429`) | Pause this provider and link to ChatGPT Settings → Usage. Do not infer a reset time. |
| Route unavailable (`503`) | Preserve credentials and retry later with bounded backoff. |
| Unsupported capability/model/request (`400`) | Inspect the documented error and remove or change the unsupported feature. Do not retry the same request unchanged. |
| Permission or route rejected (`401`/`403`) | Stop inference, preserve the request ID, and show a plain explanation. Do not repeatedly retry. |

**Never silently fall back to another billing path.** If the person has not already selected another provider, ask them to choose their own key or an available Daksha-paid option. Any fallback must make clear who pays.

## 10. Implementation phases

### Phase 0 — Confirm the eligible deployment shape

- [ ] Decide which first target is genuinely user-controlled: local desktop/CLI, local companion, or a self-hosted VM controlled by the user.
- [ ] Confirm the target's OAuth callback, browser handoff, secure credential storage, and direct network access are compatible with OpenAI's current open-source guide.
- [ ] Confirm the code being integrated is distributed as an eligible open-source app and review the applicable licence.
- [ ] For the centrally hosted Daksha service, submit the [commercial partner interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) and obtain written approval before implementing a hosted path.
- [ ] Record the deployment decision and constraints in [DECISIONS.md](./DECISIONS.md).

**Exit condition:** no SIWC plan-usage token or inference call is stored or routed through a Daksha-managed hosted backend.

### Phase 1 — Local OAuth proof of concept

- [ ] Add a local SIWC account registration and callback flow.
- [ ] Generate and persist a stable host ID.
- [ ] Validate OIDC state, nonce, ID token, and granted scopes.
- [ ] Save credentials in protected local storage.
- [ ] Prove access-token refresh and token rotation.
- [ ] Add disconnect and local credential deletion.
- [ ] Test multiple ChatGPT accounts without mixing registrations.

### Phase 2 — OpenAI model adapter

- [ ] Add the adapter behind `@debo/llm` for the eligible local/user-controlled runtime only.
- [ ] Add account-specific model discovery.
- [ ] Implement streamed `POST /v1/responses` requests with `store: false`.
- [ ] Add strict request validation for the current SIWC preview contract.
- [ ] Map errors to the user-facing recovery behavior above.
- [ ] Prove the application never sends SIWC credentials to Daksha's managed API.

### Phase 3 — Daksha "Ask my life" integration

- [ ] Retrieve only the signed-in Daksha user's relevant journal context through the existing authenticated API.
- [ ] Return the minimum context and stable source references needed for the current question.
- [ ] Send that context from the local/user-controlled runtime directly to OpenAI.
- [ ] Keep source chips and the existing "do not guess" behavior.
- [ ] Start with a user-initiated text request only.

### Phase 4 — UX, privacy and release readiness

- [ ] Add the separate "Use my ChatGPT plan" connection and status in Settings → AI provider.
- [ ] Explain data sharing, eligibility, allowance limits, and provider fallback before consent.
- [ ] Link to ChatGPT Settings → Usage and explain how to disconnect.
- [ ] Update the privacy policy, provider list, [BYOK and plans](./BYOK-AND-PLANS.md), and relevant user documentation.
- [ ] Test disconnect, revoke, usage-limit, unavailable-route, and unsupported-capability paths.
- [ ] Keep this option hidden on the hosted Daksha service unless commercial approval is obtained.

## 11. Acceptance criteria

- [ ] A person can connect a ChatGPT account without entering an OpenAI API key.
- [ ] Identity sign-in and ChatGPT plan usage are shown as separate permissions.
- [ ] Plan inference is possible only when the required scope is present and the runtime has passed the eligibility gate.
- [ ] No SIWC token is stored in Neon, Cloudflare, browser storage, or Daksha-managed logs.
- [ ] The local runtime calls only the documented `/v1/models` and `/v1/responses` endpoints for this feature.
- [ ] Every HTTP Responses request sets `store: false` and `stream: true`.
- [ ] Only the authenticated Daksha user's minimum relevant context is sent, and the answer retains source references.
- [ ] User content and tokens never appear in application logs or analytics.
- [ ] Expired/revoked credentials, usage limits, unsupported features, and network failures have tested recovery paths.
- [ ] No failed ChatGPT-plan request is silently billed to a different provider.
- [ ] The user can disconnect the ChatGPT account and revoke/clear local credentials.
- [ ] The hosted SaaS path remains disabled until OpenAI approval and a compliant architecture are documented.

## 12. Official references

- [OpenAI SIWC quickstart](https://developers.openai.com/siwc/quickstart)
- [Open-source ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Open-source registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Accounts, sessions and credential security](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- [Sign in with ChatGPT Terms](https://openai.com/policies/sign-in-with-chatgpt-terms/)
- [Using your ChatGPT plan in other apps and sites](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- [Commercial partner interest form](https://openai.com/form/sign-in-with-chatgpt-interest/)

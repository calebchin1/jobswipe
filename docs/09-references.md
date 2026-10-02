# References and verification notes

Reviewed September 28, 2026. References inform the plan; they are not a warranty that every future provider version or legal interpretation is unchanged. Recheck SDK compatibility and applicable policies when implementing the dependent feature. No exact dependency versions have been selected.

## Technical

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): grants, RLS, privileged credentials and view behaviour. The plan deliberately separates fields that may be revealed from fields that remain private.
- [Supabase private asset serving](https://supabase.com/docs/guides/storage/serving/downloads): signed object links remain valid until expiry; the proposed authenticated streaming route provides a fresh application authorization check for each new download.
- [Supabase storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals): private bucket access and storage policy context.
- [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication): central authorization and data-transfer projections; route visibility alone is insufficient.
- [Expo development builds FAQ](https://docs.expo.dev/develop/development-builds/faq/): native libraries require a compatible development build rather than assuming Expo Go contains them.
- [Expo native customization](https://docs.expo.dev/workflow/customizing/): native configuration/build implications.
- [LiveKit tokens and grants](https://docs.livekit.io/home/server/generating-tokens): room/participant grants and permitted publishing sources. Validate actual selected SDK token lifecycle during P02.
- [LiveKit server VideoGrant interface](https://docs.livekit.io/reference/server-sdk-js/interfaces/VideoGrant.html): source restrictions used for audio-only round one.
- [LiveKit pricing](https://livekit.com/pricing) and [Daily pricing](https://www.daily.co/pricing/video-sdk/): reference providers; cost figures are not embedded in product logic. A complete operating budget also needs hosting, storage, processing, email and support.

## Regulatory and product

- [Ontario publicly advertised job postings guide](https://www.ontario.ca/document/your-guide-employment-standards-act-0/requirements-related-publicly-advertised-job): posting and notice requirements and archival scope. Current status and interpretations need legal review before production.
- [Ontario posting regulation](https://www.ontario.ca/laws/regulation/240476): annual-equivalent compensation limits and interview-notification framework.
- [Ontario ESA guide including platform requirements](https://www.ontario.ca/book/export/html/95373): fraud reporting and public policy obligations for platform operators.
- [OHRC application-form guidance](https://www.ohrc.on.ca/en/iv-human-rights-issues-all-stages-employment/4-designing-application-forms): the reason DOB collection and school disclosure remain unresolved rather than assumed compliant merely because a field is hidden.
- [Ontario minimum working ages](https://www.ontario.ca/page/minimum-age-work): use workplace-specific reviewed rules, not an unrestricted employer-entered age preference. The source includes exceptions and additional categories beyond a simple 14/15/16/18 selector.
- [OPC consent principle](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/): meaningful consent, changes in purpose and youth maturity considerations.
- [Ontario recruiter licensing](https://www.ontario.ca/page/licensing-temporary-help-agencies-and-recruiters): assess scope before introducing paid recruiting services or per-hire fees.
- [Bill C-36 legislative status](https://www.parl.ca/legisinfo/en/bill/45-1/c-36): monitor separately from existing obligations; do not treat proposed law as already in force.
- [J-PAL name-discrimination study summary](https://www.povertyactionlab.org/evaluation/discrimination-against-skilled-immigrants-canadian-labor-market): rationale for testing the product; not evidence of this platform's effect on student hiring outcomes.

## What still requires a dedicated implementation-time check

- Exact Expo/React Native/LiveKit compatibility and supported native operating-system versions.
- Next.js and Supabase authentication integration versions, deployment timeouts and streaming limits.
- Workflow provider execution constraints, idempotency behaviour and environment isolation.
- PDF/DOCX parser security, rendering fidelity, malware scanning and worker deployment choice.
- Resend attachment limits, delivery/idempotency semantics and verified sender setup.
- Notification platform permissions and current App Store/Google Play review requirements for the selected audience/features.
- Ad network minors policy and permitted contextual targeting; no ad SDK in beta.
- Data residency/subprocessor contracts and exact retention durations.
- Availability of routes/commute data and usage costs; no fake exact commute times.

These checks are scheduled in tickets rather than filled with guessed versions or unverified provider guarantees.

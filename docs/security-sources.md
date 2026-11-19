# Security knowledge sources

Attribution and license record for the content ingested into KAREN's graph by
`api/scripts/ingest-security-kb.mjs` and `api/scripts/ingest-mitre.mjs`.

## OWASP projects

- **Web Security Testing Guide (WSTG)** — https://github.com/OWASP/wstg
- **Cheat Sheet Series** — https://github.com/OWASP/CheatSheetSeries
- **Mobile Application Security Verification Standard (MASVS)** — https://github.com/OWASP/masvs
- **Mobile Application Security Testing Guide (MASTG)** — https://github.com/OWASP/mastg

License: **Creative Commons Attribution-ShareAlike 4.0 International**
(https://creativecommons.org/licenses/by-sa/4.0/). Each ingested node stores
`license`, `attribution` and the original GitHub URL in its properties. The
KB content remains subject to CC BY-SA 4.0; do not strip these attributions
when exporting or republishing chunks.

OWASP and the OWASP logo are registered trademarks of the OWASP Foundation.

## PayloadsAllTheThings

- https://github.com/swisskyrepo/PayloadsAllTheThings

License: **MIT**. Attribution stored per node.

## MITRE ATT&CK and CAPEC

- https://github.com/mitre/cti (STIX collections)
- https://attack.mitre.org/

MITRE grants a non-exclusive, royalty-free license to use ATT&CK and CAPEC for
research, development and commercial purposes, provided copies reproduce the
copyright designation and license. Every MITRE node stores this notice:

> © 2026 The MITRE Corporation. This work is reproduced and distributed with
> the permission of The MITRE Corporation.

Full license: https://github.com/mitre/cti/blob/master/LICENSE.txt

## NVD / NIST

- https://nvd.nist.gov/developers/start-here

All NIST publications are in the public domain under Title 17 of the United
States Code. Services using NVD are asked to display a notice; KAREN stores
`Source: NVD / NIST (public domain)` in CVE lookup results.

## Deliberately excluded

| Source | Reason |
|---|---|
| HackTricks | No license declaration in the repository |
| GTFOBins / LOLBAS | GPL-3.0 copyleft |
| SigmaHQ rules | License not clearly asserted by GitHub API |

## Re-running ingestion

Both scripts are idempotent — chunks are deduplicated by `content_hash`:

```bash
cd /home/admin/karen/api
node scripts/ingest-security-kb.mjs
node scripts/ingest-mitre.mjs
```

`GITHUB_TOKEN` is optional (raises GitHub Tree API rate limit). `NVD_API_KEY`
is optional (raises NVD rate limit). Neither is required.

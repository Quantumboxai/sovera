# Business Associate Agreement (BAA) — Template

> Template only. Have qualified U.S. legal counsel review before signing.
> References: HIPAA Privacy & Security Rules (45 CFR Parts 160 and 164),
> HITECH Act, Omnibus Rule.

This Business Associate Agreement ("Agreement") is entered into between
**[Covered Entity Legal Name]** ("Covered Entity") and **Sovera SAS** ("Business Associate"),
effective **[Effective Date]**.

## 1. Definitions

Capitalised terms not defined here have the meanings set forth in 45 CFR
§§ 160.103 and 164.501.

## 2. Permitted uses and disclosures of PHI

Business Associate may use or disclose Protected Health Information (PHI)
solely to:

1. Perform the services described in the underlying Services Agreement.
2. Carry out its own management, administration, and legal responsibilities,
   provided that disclosures are required by law or that the recipient is
   bound by equivalent confidentiality obligations and reports any breach
   back to Business Associate.

## 3. Obligations of Business Associate

Business Associate agrees to:

1. **Not use or disclose PHI** other than as permitted by this Agreement or
   required by law.
2. **Use appropriate safeguards**, including those required under Subpart C
   of 45 CFR Part 164 (Security Rule):
   - **Encryption at rest** with customer-managed keys (Key Vault Premium HSM,
     RSA-HSM 3072, auto-rotated).
   - **Encryption in transit** TLS 1.2+.
   - **Per-tenant logical isolation** (dedicated Postgres database, blob
     container, Web PubSub hub, APIM product).
   - **Row-Level Security** enforced and forced on every tenant-scoped table.
   - **Audit logging** via pgaudit + per-row audit triggers + immutable
     blob archive.
   - **Identity & access management** via Microsoft Entra External ID with MFA.
3. **Report any Use or Disclosure** not provided for by this Agreement, and
   any Security Incident, within **24 hours** of discovery.
4. **Report any Breach of Unsecured PHI** within **5 business days** of
   discovery, providing the information required by 45 CFR § 164.410.
5. **Ensure Subcontractors** that create, receive, maintain or transmit PHI
   on behalf of Business Associate agree in writing to the same restrictions.
   Current subcontractor: Microsoft Azure (covered by separate BAA with
   Microsoft Corporation).
6. **Make PHI available** to Covered Entity within **10 business days** of
   request to enable access (§ 164.524) and amendment (§ 164.526).
7. **Make available an accounting** of disclosures within 30 days
   (§ 164.528). The audit trail in `audit.events` supports this.
8. **Make internal practices, books, and records** relating to the use and
   disclosure of PHI available to HHS for purposes of determining compliance.
9. **Return or destroy** all PHI upon termination, or — if return/destruction
   is infeasible — extend the protections of this Agreement.

## 4. Obligations of Covered Entity

Covered Entity shall:
1. Notify Business Associate of any limitation in its Notice of Privacy Practices that affects Business Associate's use or disclosure of PHI.
2. Notify Business Associate of any restriction on use or disclosure that Covered Entity has agreed to (§ 164.522).
3. Not request that Business Associate use or disclose PHI in any manner that would not be permissible under HIPAA if done by Covered Entity.

## 5. Term and termination

- Effective from the Effective Date, coterminous with the Services Agreement.
- Either party may terminate for material breach not cured within 30 days.
- Upon termination, Business Associate shall return or destroy all PHI within 60 days.

## 6. Breach notification

Business Associate shall notify Covered Entity in writing of any Breach of
Unsecured PHI without unreasonable delay and in no case later than **5
business days** after discovery, providing:

- Identification of each individual whose PHI has been or is reasonably believed to have been accessed, acquired, used, or disclosed.
- A description of what happened, including the date of the Breach and the date of discovery.
- A description of the types of PHI involved.
- Any steps individuals should take to protect themselves.
- A brief description of what Business Associate is doing to investigate, mitigate, and prevent further Breaches.

## 7. Miscellaneous

- **Amendment**: any amendment to comply with changes in HIPAA or related regulations.
- **Survival**: Sections 3, 5 (return/destruction), and 6 survive termination.
- **Interpretation**: ambiguities resolved in favour of compliance with HIPAA.
- **Governing law**: [State/Country].

---

Signed for **Covered Entity**: ______________________  Date: __________

Signed for **Sovera SAS**: ______________________  Date: __________

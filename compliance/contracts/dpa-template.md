# Data Processing Agreement (DPA) — Template

> Aligned with GDPR Art. 28 and EDPB DPA guidance. Have qualified EU
> counsel review before signing.

Between **[Customer Legal Name]** ("Controller") and **Sovera SAS**, RCS [], headquartered at [], ("Processor"), effective **[Effective Date]**.

## 1. Subject matter

Processor will Process Personal Data on behalf of Controller solely for the
purpose of providing the Sovera platform services described in the underlying
Services Agreement.

## 2. Duration

Coterminous with the Services Agreement, plus a 60-day return/deletion period.

## 3. Nature & purpose of Processing

Hosting, storage, retrieval, transformation, backup, and disaster recovery
of Controller's application data, including special categories (Art. 9) where
the underlying application processes health data.

## 4. Categories of data subjects and personal data

As described in Controller's RoPA. By default: end users of Controller's
application, including identification, contact, health (Art. 9), and
authentication metadata.

## 5. Obligations of the Processor

Processor shall:

1. Process Personal Data **only on documented instructions** from Controller, including with regard to transfers to a third country.
2. Ensure persons authorised to process Personal Data are bound by **confidentiality**.
3. Implement the **technical and organisational measures** set out in [Annex A](#annex-a--technical-and-organisational-measures-art-32).
4. Respect the conditions for engaging **sub-processors** (Section 7).
5. **Assist Controller** in fulfilling its obligation to respond to data subject requests (Arts. 12–22), via the platform's export, rectification, and deletion APIs.
6. **Assist Controller** in ensuring compliance with Arts. 32–36 (security, breach notification, DPIA, prior consultation).
7. **Notify Controller without undue delay** (and in any event within 24 hours of confirmation) of any Personal Data Breach affecting Controller's data.
8. **Return or delete** all Personal Data at the end of services, and delete existing copies unless storage is required by Union or Member-State law.
9. Make available to Controller all information necessary to demonstrate compliance with Art. 28, and allow for and contribute to **audits** (subject to reasonable confidentiality and security constraints) at most once per year and upon Personal Data Breach.

## 6. Transfers outside the EEA

By default, no transfer outside the EEA. Data residency is **France Central**
and the platform's region-lock policy denies any other region. Any future
transfer requires Controller's prior written authorisation and EU-approved
safeguards (e.g. SCCs 2021/914).

## 7. Sub-processors

Controller authorises the following sub-processors:

| Sub-processor | Purpose | Location |
|---|---|---|
| Microsoft Corporation / Microsoft France (Azure) | Cloud infrastructure | France Central |
| Microsoft Entra External ID | Identity provider | EU region |

Processor shall inform Controller of any intended changes concerning the
addition or replacement of sub-processors at least **30 days in advance**,
giving Controller the opportunity to object. If Controller objects, Processor
may terminate the affected service with a pro-rata refund.

## 8. Breach notification (Art. 33)

Within 24 hours of confirmation, Processor provides:

- Nature of the breach, categories and approximate number of subjects.
- Likely consequences.
- Measures taken or proposed to address the breach and mitigate effects.

Controller remains responsible for notifying the CNIL and data subjects.

## 9. Liability

As set out in the Services Agreement. Caps do not apply to obligations under
Art. 82 GDPR towards data subjects.

## Annex A — Technical and organisational measures (Art. 32)

See [controls/gdpr-art32-mapping.md](../controls/gdpr-art32-mapping.md). Highlights:

- CMK encryption at rest (RSA-HSM 3072) + TLS 1.2+ in transit.
- Per-tenant logical isolation (DB, blob container, hub, APIM product).
- Postgres RLS forced + double-check against pinned tenant UUID.
- pgaudit + per-row audit trigger + immutable blob archive.
- Microsoft Entra External ID (MFA + conditional access).
- Microsoft Sentinel analytics on KV access, admin sign-in, RLS exception spikes, shared-key usage attempts.
- Zone-redundant HA; PITR 35 days; restore drill quarterly.

---

Signed for **Controller**: ______________________  Date: __________

Signed for **Processor (Sovera SAS)**: ______________________  Date: __________

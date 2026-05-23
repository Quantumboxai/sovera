# DPIA — Data Protection Impact Assessment

> Template aligned with CNIL methodology (PIA Knowledge Bases) and EDPB guidelines.
> Complete one DPIA per **processing activity** that is likely to result in a
> high risk to the rights and freedoms of natural persons (GDPR Art. 35).

| Field | Value |
|---|---|
| DPIA reference | `DPIA-<tenant-slug>-<YYYYMMDD>` |
| Processing activity | e.g. "Patient record management for outpatient clinic" |
| Customer (controller) | |
| Sovera (processor) contact | |
| DPO (controller side) | |
| Date drafted | |
| Date reviewed | |
| Reviewer | |
| Status | Draft / In review / Approved / Superseded |

## 1. Description of the processing

### 1.1 Nature, scope, context, purposes
- **Nature**: e.g. storage + retrieval + analytics of electronic patient records.
- **Scope**: data subjects (patients, clinicians); estimated volume per year.
- **Context**: regulatory framework (HDS, GDPR), public expectations.
- **Purpose**: e.g. "Provision of care, billing, regulatory reporting".

### 1.2 Categories of personal data
- Identification: name, DOB, INS/NIR.
- Health (Art. 9 GDPR special category): diagnoses, prescriptions, vitals.
- Contact: address, phone, email.
- Other: practitioner notes, imaging references.

### 1.3 Recipients
- Internal: care team within the customer's organisation (Entra group).
- Processors: Sovera (this DPIA); Microsoft Azure (sub-processor, HDS-certified).
- Third parties: none unless explicitly listed here.

### 1.4 Retention
- Active record: per French Public Health Code (10–20 years depending on case).
- Backup: PITR 35 days; immutable audit logs 730 days hot + archive.
- Deletion: triggered by tenant offboarding or per-row deletion API.

### 1.5 Functional description
Describe data flows. Reference the [architecture diagram](../../README.md).

## 2. Fundamental principles

### 2.1 Proportionality & necessity
- Lawful basis: Art. 6(1)(c) legal obligation + Art. 9(2)(h) provision of care.
- Data minimisation: only fields required by the workflow are stored.
- Accuracy: edits are audit-trailed; subjects can request correction via the controller.

### 2.2 Rights of data subjects
| Right | How Sovera supports it |
|---|---|
| Information | Controller's privacy notice references Sovera as processor. |
| Access | DAB GraphQL query scoped by `tenant_id`. |
| Rectification | Standard UPDATE through DAB; audit trail preserved. |
| Erasure | DELETE through DAB or per-subject purge job; audit row marked `op=DELETE`. |
| Restriction | Application-level flag (controller implements). |
| Portability | Export endpoint produces JSONL + linked blobs. |
| Objection | Application-level (controller). |
| Automated decision-making | None by Sovera platform. |

## 3. Risk assessment

For each risk, document **threat**, **likelihood (1–4)**, **severity (1–4)**, and **residual risk** after controls.

### 3.1 Illegitimate access
- Threats: insider abuse, credential theft, mis-scoped query.
- Controls: Entra MFA + conditional access; Postgres RLS forced; per-tenant DB; KV-stored credentials; pgaudit; Sentinel rule `Sovera-AdminSignInFromNewIP`.
- Residual: **Low**.

### 3.2 Unwanted modification
- Threats: SQL injection, bug in app code.
- Controls: DAB parameterised queries; RLS WITH CHECK; audit trigger captures pre/post diff; immutable audit container.
- Residual: **Low**.

### 3.3 Data disappearance
- Threats: ransomware, accidental delete, region outage.
- Controls: PITR 35 days; Blob versioning + soft delete; ZRS; restore drill quarterly.
- Residual: **Low**.

## 4. Stakeholders consulted
- DPO, CISO, lead developer, customer's clinical lead.
- Data subjects' representative bodies if applicable.

## 5. Validation
- DPIA accepted by controller's DPO on YYYY-MM-DD.
- CNIL prior consultation required? Yes / No (only if residual risk remains high).

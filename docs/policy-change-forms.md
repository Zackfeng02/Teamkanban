# Policy-change intake forms — local delivery

## Scope and flow

The board's **新建变更任务** opens forms for address/move, vehicle addition/replacement/removal, property addition/removal, coverage change, cancellation, reinstatement and generic policy change. Quote and renewal workflows remain separate.

1. Search ClientCoreBMS by client code, name or policy number and explicitly confirm the customer.
2. Select the policy year and, where relevant, a specific old address, asset or insured object. Read and lock the database snapshot.
3. Upload TXT, text PDF or screenshots, paste chat text, or select the member's existing sources. Identify proposed fields using the configured AI model, with exact supporting quotations. Existing manually entered fields are not overwritten.
4. Review editable proposed fields, ownership and priority; explicitly confirm the form; save one new task with its original sources and default workflow.

The old snapshot comes from authenticated server-side ClientCoreBMS reads; the client cannot supply or replace it at save time. It records revisions and capture time. A fresh read is compared before saving; changed records require reloading. Saving twice with the same draft/input returns the same task; a conflicting retry is rejected. Client/type cannot be reassigned after the retained form is created. Missing database values remain unknown. Coverage subjects stored only as descriptive text are shown intact, not invented as structured VIN/address/coverage fields.

Contact addresses and insured property/vehicle addresses are distinct. Asset ownership is not coverage. A move does not imply a property sale. Multi-asset clients must select the affected old object for replacement/removal; other assets remain unchanged. Imported source policy records remain distinct from operational terms; VOID-number records are not selectable.

## Evidence processing

Text files must be UTF-8, at most 60,000 characters. Upload limit is 12 MB; PDF text extraction accepts up to 25 pages. Image OCR uses Windows locally when LOCAL_PREVIEW=true; it needs installed OCR languages. OCR is imperfect and must be checked against the original image. Scanned PDFs without text and failed OCR remain attachments with an explicit warning; users can supply text or fill fields manually. No attachments are sent to a vision provider. Extracted/selected chat text goes to the existing configured text AI service; the customer database snapshot does not.

AI is instructed to ignore embedded commands, avoid guessing identity, consent or effective coverage, and leave ambiguous/relative dates blank. Returned field keys, dates and options are validated, and every proposed extraction must quote text present in the source. Human review is mandatory; exact quoting does not independently prove the model's interpretation.

Original files and extracted text remain linked to the task. Local preview bypasses S3 and keeps attachments on this computer. No AWS, live customer database or external BMS changes are part of this delivery.

## Business confirmation boundary

Creating this task does not update ClientCoreBMS. This delivery implements change intake and preserved before/after requests, not automatic application of proposed field changes. For a structured task's change event, the misleading description-only write option is disabled: record the actual field change in ClientCoreBMS, then verify its business record. Initial actual premium, cancellation and reinstatement confirmation retain their existing behavior. The generic archive checklist is still a manual record; it is not a field-write receipt.

## Verification

All 119 tests passed at the first complete build. Targeted tests cover every supported form type, immutable server snapshots, stale data, forged fields, source ownership, required review, retries, AI evidence validation and UTF-8 file handling. Typecheck and production build passed.

Local HTTP and browser acceptance used fictitious data: customer lookup, old address population/readonly fields, live configured-model extraction with citations, task creation and deduplicated save passed. ClientCoreBMS's old address remained unchanged. PDF text and Windows OCR were exercised locally; the OCR fixture showed a letter/date recognition error, confirming why review remains required. Final storage/restart and additional checks are recorded with the local handoff artifact.

Existing unrelated Kanban edits were preserved. Before-images for this turn are under ClientCoreBMS/.local/change-form-baseline; changes are not automatically committed together with unrelated work.

Final local verification: task/form/session persisted across restart; direct PDF and screenshot uploads returned retained evidence; a later ClientCore revision caused HTTP 409 at save with the old address unchanged. Existing uploaded PDF selection also extracted and retained its text. Incomplete chat is allowed to produce warnings and empty/partial fields for manual completion. Desktop and 390px mobile views were inspected.

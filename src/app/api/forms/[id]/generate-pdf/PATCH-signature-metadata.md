# Patch: Add Signature Metadata to Generated PDFs

## Where to Apply
File: `src/app/api/forms/[id]/generate-pdf/route.ts`

## Changes

### 1. Update the POST handler to accept signature_metadata

In the POST function, after extracting `submission_data` and `applicant_name` from body, also extract `signature_metadata`:

```typescript
const { submission_data, applicant_name, signature_metadata } = body;
```

Pass `signature_metadata` to both `generateTemplateOverlayPdf` and `generateFlatLayoutPdf`.

### 2. Add signature footer to Template Overlay PDF

In `generateTemplateOverlayPdf`, just before `const pdfBytes = await pdfDoc.save();`, add:

```typescript
// Add signature metadata footer if present
if (signature_metadata) {
  const lastPage = pages[pages.length - 1];
  const metaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const timestamp = signature_metadata.timestamp
    ? new Date(signature_metadata.timestamp).toLocaleString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZoneName: 'short',
      })
    : 'Unknown';
  const ip = signature_metadata.ip_address || 'Unknown';
  const metaText = `Signed: ${timestamp} | IP: ${ip}`;

  lastPage.drawText(metaText, {
    x: 50,
    y: 20,
    size: 7,
    font: metaFont,
    color: rgb(0.5, 0.5, 0.5),
  });
}
```

### 3. Add signature footer to Flat Layout PDF

In `generateFlatLayoutPdf`, just before the final footer section, add the same metadata text rendering.

### 4. Update the caller (bulk-download and generate-pdf callers)

When calling generate-pdf, include `signature_metadata` from the submission record:

```typescript
body: JSON.stringify({
  submission_data: submission.form_data,
  applicant_name: submission.applicant_name,
  signature_metadata: submission.signature_metadata,
}),
```

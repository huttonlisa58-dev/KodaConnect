import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export interface DetectedField {
  field_key: string;
  field_type: 'text' | 'textarea' | 'date' | 'phone' | 'email' | 'ssn' | 'checkbox' | 'checkbox_group' | 'radio' | 'signature' | 'initial' | 'file_upload' | 'number' | 'currency';
  label: string;
  page_numbers: number[];
  is_required: boolean;
  description?: string;
  options?: string[]; // For checkbox_group or radio
  similar_labels: string[]; // Other labels that map to this same field
}

export interface FieldDetectionResult {
  template_id: string;
  total_pages: number;
  detected_fields: DetectedField[];
  raw_fields_by_page: { page: number; fields: string[] }[];
  status: 'pending_review' | 'approved' | 'rejected';
  developer_comments?: string;
}

const FIELD_DETECTION_PROMPT = `You are analyzing a PDF form page to detect all fillable fields.

For each field you detect, identify:
1. The field label/name (what it's asking for)
2. The field type (text, date, phone, email, ssn, checkbox, signature, initial, textarea, radio, checkbox_group, number, currency)
3. Whether it appears to be required (marked with * or "required")
4. Any options if it's a multiple choice field

Common fields to look for:
- Name fields (First Name, Last Name, Full Name, Applicant Name, etc.)
- Contact info (Phone, Email, Address, City, State, ZIP)
- Identity info (SSN, Date of Birth, Gender)
- Employment info (Employer, Position, Start Date, Salary)
- Checkboxes (Yes/No questions, acknowledgments)
- Signatures and initials
- Date fields
- Emergency contact info
- Medical/health information

Return a JSON array of detected fields. Example format:
[
  {"label": "First Name", "type": "text", "required": true},
  {"label": "Social Security Number", "type": "ssn", "required": true},
  {"label": "Date of Birth", "type": "date", "required": true},
  {"label": "I agree to the terms", "type": "checkbox", "required": true},
  {"label": "Applicant Signature", "type": "signature", "required": true},
  {"label": "Employment Status", "type": "radio", "required": true, "options": ["Full-time", "Part-time", "Contract"]}
]

Only return the JSON array, no other text. If no fields are detected on this page, return an empty array [].`;

export async function analyzePageForFields(
  imageBase64: string,
  pageNumber: number
): Promise<{ page: number; fields: Array<{ label: string; type: string; required: boolean; options?: string[] }> }> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: FIELD_DETECTION_PROMPT,
          },
        ],
      },
    ],
  });

  // Extract text content from response
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return { page: pageNumber, fields: [] };
  }

  try {
    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const fields = JSON.parse(jsonMatch[0]);
      return { page: pageNumber, fields };
    }
  } catch (e) {
    console.error('Failed to parse field detection response:', e);
  }

  return { page: pageNumber, fields: [] };
}

// De-duplicate fields across pages
export function deduplicateFields(
  rawFieldsByPage: Array<{ page: number; fields: Array<{ label: string; type: string; required: boolean; options?: string[] }> }>
): DetectedField[] {
  const fieldMap = new Map<string, DetectedField>();

  // Normalize field label for comparison
  const normalizeLabel = (label: string): string => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  };

  // Common field name variations that should map to same field
  const fieldAliases: Record<string, string[]> = {
    'first_name': ['first_name', 'firstname', 'fname', 'given_name'],
    'last_name': ['last_name', 'lastname', 'lname', 'surname', 'family_name'],
    'full_name': ['full_name', 'fullname', 'name', 'applicant_name', 'employee_name', 'caregiver_name', 'client_name'],
    'ssn': ['ssn', 'social_security', 'social_security_number', 'ss_number', 'ss'],
    'dob': ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'birthday'],
    'phone': ['phone', 'phone_number', 'telephone', 'tel', 'mobile', 'cell', 'cell_phone', 'home_phone', 'work_phone'],
    'email': ['email', 'email_address', 'e_mail'],
    'address': ['address', 'street_address', 'street', 'home_address', 'mailing_address'],
    'city': ['city', 'town'],
    'state': ['state', 'province'],
    'zip': ['zip', 'zip_code', 'zipcode', 'postal_code', 'postal'],
    'signature': ['signature', 'applicant_signature', 'employee_signature', 'sign', 'caregiver_signature'],
    'date': ['date', 'todays_date', 'current_date', 'signature_date'],
    'initials': ['initials', 'initial', 'init'],
  };

  // Find canonical key for a label
  const findCanonicalKey = (label: string): string => {
    const normalized = normalizeLabel(label);
    for (const [canonical, aliases] of Object.entries(fieldAliases)) {
      if (aliases.includes(normalized) || aliases.some(a => normalized.includes(a))) {
        return canonical;
      }
    }
    return normalized;
  };

  // Process each page
  for (const { page, fields } of rawFieldsByPage) {
    for (const field of fields) {
      const canonicalKey = findCanonicalKey(field.label);

      if (fieldMap.has(canonicalKey)) {
        // Field already exists - add page number and similar label
        const existing = fieldMap.get(canonicalKey)!;
        if (!existing.page_numbers.includes(page)) {
          existing.page_numbers.push(page);
        }
        if (!existing.similar_labels.includes(field.label)) {
          existing.similar_labels.push(field.label);
        }
        // Mark as required if ANY instance is required
        if (field.required) {
          existing.is_required = true;
        }
      } else {
        // New field
        fieldMap.set(canonicalKey, {
          field_key: canonicalKey,
          field_type: field.type as DetectedField['field_type'],
          label: field.label,
          page_numbers: [page],
          is_required: field.required,
          similar_labels: [field.label],
          options: field.options,
        });
      }
    }
  }

  // Sort by first page appearance
  return Array.from(fieldMap.values()).sort((a, b) => a.page_numbers[0] - b.page_numbers[0]);
}

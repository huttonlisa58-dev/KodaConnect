# KodaConnect - Office Portal

Document Management Portal for Complete Homecare.

## Features

- **Office Portal**: Staff dashboard for managing documents and submissions
- **Applicant Forms**: OTP-verified form submission for applicants
- **PDF-First Workflow**: Upload PDFs → Define fields → Generate web forms → Fill PDFs
- **Multi-State Support**: NY/LHCSA, PA/OLTL with state-specific forms
- **Permission Levels**: View, Download PDF, Edit Until Approval, Edit Anytime, Super Admin

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **SMS**: Twilio (OTP and notifications)
- **PDF Processing**: pdf-lib
- **Hosting**: Vercel

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in credentials
4. Run the database schema in Supabase SQL Editor
5. Create storage buckets: `documents`, `filled-pdfs`, `uploads`
6. Run locally: `npm run dev`

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
```

## Deployment

Deploy to Vercel and add the environment variables in the Vercel dashboard.
